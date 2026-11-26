/** Servicio de envíos: creación, ciclo de vida, mensajeros, verificación de medidas y rastreo público. */
import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { auth, bad, forbidden, h, notFound, nums } from '../auth.js';
import { many, one, query } from '../db.js';
import { chargeableKg } from '../lib/pricing.js';
import { buildPlan } from './logistics.js';
import { loadServices } from './catalog.js';
import { carrierInfo, createGuide, listCarriers, schedulePickup, track as carrierTrack } from '../carriers/index.js';
import { customerMessagesFor, notifyAvailable, notifyUsers, shipmentChanged } from './notifications.js';
import { config } from '../config.js';

export const STATUS = ['creado', 'asignado', 'recogido', 'en_ruta', 'entregado', 'novedad', 'devuelto', 'cancelado'];
export const STATUS_LABEL = {
  creado: 'Creado', asignado: 'Mensajero asignado', recogido: 'Recogido', en_ruta: 'En ruta',
  entregado: 'Entregado', novedad: 'Novedad en la entrega', devuelto: 'Devuelto', cancelado: 'Cancelado',
};
/** Transiciones permitidas al mensajero. */
const COURIER_FLOW = {
  asignado: ['recogido', 'novedad'],
  recogido: ['en_ruta', 'novedad'],
  en_ruta: ['entregado', 'novedad'],
  novedad: ['en_ruta', 'devuelto'],
};

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'DM' + Array.from({ length: 7 }, () => ALPHA[randomInt(ALPHA.length)]).join('');

const SHIP_NUMS = ['baseline_total', 'declared_value', 'cod_amount', 'price', 'courier_fee'];
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
export const shipmentOut = (s) => {
  if (!s) return s;
  const o = nums(s, SHIP_NUMS);
  for (const k of ['items', 'packages', 'quote', 'verified']) if (o[k] != null) o[k] = parse(o[k]);
  o.status_label = STATUS_LABEL[o.status] ?? o.status;
  return o;
};

const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);

export async function createShipmentFor(store, b, userId) {
  const recipientName = clean(b.recipientName, 80), recipientPhone = clean(b.recipientPhone, 20);
  const address = clean(b.address), city = clean(b.city, 60);
  if (!recipientName || !recipientPhone || !address || !city) throw bad('Completa nombre, teléfono, dirección y ciudad del destinatario');
  if (!/^[0-9+ ()-]{7,20}$/.test(recipientPhone)) throw bad('Teléfono del destinatario inválido');
  const recipientEmail = clean(b.recipientEmail, 120).toLowerCase() || null;
  if (recipientEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) throw bad('Correo del destinatario inválido');
  const plan = await buildPlan({
    storeId: store.id, originCity: store.city, items: b.items, destCity: city,
    declaredValue: Number(b.declaredValue) || 0, codAmount: Number(b.codAmount) || 0, packing: b.packing,
  });
  if (!plan.quotes.length) throw bad('No hay servicios disponibles para ese destino');
  const quote = (b.serviceId && plan.quotes.find((q) => q.serviceId === b.serviceId)) || plan.quotes[0];
  const service = (await loadServices()).find((s) => s.id === quote.serviceId);
  const carrier = service?.carrier ?? 'propia';
  const courierFee = carrier === 'propia' ? Math.round((quote.freight * (service?.courierSharePct ?? 70)) / 100 / 50) * 50 : 0;
  let code;
  for (let i = 0; i < 5; i++) {
    code = newCode();
    if (!(await one('SELECT 1 FROM shipments WHERE code = $1', [code]))) break;
  }
  const row = await one(
    `INSERT INTO shipments (code, store_id, service_id, recipient_name, recipient_phone, address, city, zone, notes, items, packages, quote,
       baseline_total, declared_value, cod_amount, price, courier_fee, carrier, recipient_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [code, store.id, quote.serviceId, recipientName, recipientPhone, address, city, plan.zone, clean(b.notes, 300) || null,
      JSON.stringify(plan.items), JSON.stringify(plan.packages), JSON.stringify(quote),
      quote.baselineTotal ?? null,
      plan.declaredValue, Number(b.codAmount) || 0, quote.total, courierFee, carrier, recipientEmail]);
  await query('INSERT INTO shipment_events (shipment_id, status, note, by_user) VALUES ($1,$2,$3,$4)', [row.id, 'creado', 'Guía creada', userId]);
  if (carrier !== 'propia') {
    const g = await createGuide(carrier, {
      code, store,
      shipment: { recipientName, recipientPhone, address, city, packages: plan.packages, declaredValue: plan.declaredValue, codAmount: Number(b.codAmount) || 0 },
    });
    const info = carrierInfo(carrier);
    const upd = await one('UPDATE shipments SET carrier_guide=$1 WHERE id=$2 RETURNING *', [g.guide, row.id]);
    await query('INSERT INTO shipment_events (shipment_id, status, note, by_user) VALUES ($1,$2,$3,$4)',
      [row.id, 'creado', `Guía ${info.name} N.° ${g.guide}${g.mode === 'simulado' ? ' (modo simulado)' : ''}. Agenda la recogida.`, userId]);
    await shipmentChanged(row.id, 'creado', { actorId: userId });
    return shipmentOut(upd);
  }
  await shipmentChanged(row.id, 'creado', { actorId: userId });
  await notifyAvailable(row, store);
  return shipmentOut(row);
}

async function getShipmentFor(user, id) {
  const s = await one(`SELECT s.*, st.name AS store_name, st.city AS store_city, st.address AS store_address, st.whatsapp AS store_whatsapp,
      u.name AS courier_name, u.phone AS courier_phone
    FROM shipments s JOIN stores st ON st.id = s.store_id LEFT JOIN users u ON u.id = s.courier_id WHERE s.id = $1`, [id]);
  if (!s) throw notFound('Envío no encontrado');
  if (user.role === 'tienda') {
    const store = await one('SELECT id FROM stores WHERE owner_id = $1', [user.id]);
    if (s.store_id !== store?.id) throw notFound('Envío no encontrado');
  }
  if (user.role === 'mensajero' && s.courier_id !== user.id && s.status !== 'creado') throw notFound('Envío no encontrado');
  return s;
}

async function addEvent(shipmentId, status, userId, { note, photo, receiverName } = {}) {
  if (photo && (typeof photo !== 'string' || photo.length > 900_000)) throw bad('La foto de evidencia es demasiado grande');
  await query('INSERT INTO shipment_events (shipment_id, status, note, photo, receiver_name, by_user) VALUES ($1,$2,$3,$4,$5,$6)',
    [shipmentId, status, note ? clean(note, 300) : null, photo ?? null, receiverName ? clean(receiverName, 80) : null, userId]);
}

/**
 * Trae el rastreo de la transportadora y lo refleja en el envío (estados y eventos nuevos).
 * Se ejecuta al consultar el envío o la guía pública.
 */
export async function syncCarrier(s) {
  if (!s || s.carrier === 'propia' || !s.carrier_guide || !s.pickup) return false;
  if (['entregado', 'cancelado', 'devuelto'].includes(s.status)) return false;
  const pickup = parse(s.pickup);
  let events;
  try { events = await carrierTrack(s.carrier, { guide: s.carrier_guide, since: pickup.scheduledAt ?? s.created_at }); } catch { return false; }
  const fresh = events.slice(s.carrier_synced ?? 0);
  if (!fresh.length) return false;
  for (const e of fresh) {
    if (!STATUS.includes(e.status)) continue;
    await query('INSERT INTO shipment_events (shipment_id, status, note, created_at) VALUES ($1,$2,$3,$4)', [s.id, e.status, e.note, e.at]);
  }
  const last = [...fresh].reverse().find((e) => STATUS.includes(e.status));
  await query('UPDATE shipments SET carrier_synced=$1, status=coalesce($2, status), updated_at=now() WHERE id=$3', [events.length, last?.status ?? null, s.id]);
  if (last && last.status !== s.status) await shipmentChanged(s.id, last.status, { note: last.note });
  return true;
}

export const shipmentsRouter = Router();

shipmentsRouter.get('/shipments', auth(), h(async (req, res) => {
  const { status, q } = req.query;
  const where = [], params = [];
  if (req.user.role === 'tienda') { params.push(req.store.id); where.push(`s.store_id = $${params.length}`); }
  if (req.user.role === 'mensajero') { params.push(req.user.id); where.push(`s.courier_id = $${params.length}`); }
  if (status) { params.push(String(status).split(',')); where.push(`s.status = ANY($${params.length})`); }
  if (q) { params.push(`%${String(q).toLowerCase()}%`); where.push(`(lower(s.code) LIKE $${params.length} OR lower(s.recipient_name) LIKE $${params.length} OR lower(s.city) LIKE $${params.length})`); }
  const rows = await many(`SELECT s.*, st.name AS store_name, u.name AS courier_name FROM shipments s
    JOIN stores st ON st.id = s.store_id LEFT JOIN users u ON u.id = s.courier_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.created_at DESC LIMIT 200`, params);
  res.json(rows.map(shipmentOut));
}));

shipmentsRouter.post('/shipments', auth('tienda'), h(async (req, res) => {
  res.status(201).json(await createShipmentFor(req.store, req.body ?? {}, req.user.id));
}));

shipmentsRouter.get('/shipments/:id', auth(), h(async (req, res) => {
  let s = await getShipmentFor(req.user, req.params.id);
  if (await syncCarrier(s)) s = await getShipmentFor(req.user, req.params.id);
  const events = await many(`SELECT e.id, e.status, e.note, e.photo, e.receiver_name, e.created_at, u.name AS by_name
    FROM shipment_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.shipment_id = $1 ORDER BY e.created_at`, [s.id]);
  const messages = req.user.role === 'mensajero' ? undefined : await customerMessagesFor(s.id);
  res.json({ ...shipmentOut(s), carrier_info: carrierInfo(s.carrier), events: events.map((e) => ({ ...e, status_label: STATUS_LABEL[e.status] })), messages });
}));

shipmentsRouter.post('/shipments/:id/cancel', auth('tienda', 'admin'), h(async (req, res) => {
  const s = await getShipmentFor(req.user, req.params.id);
  if (!['creado', 'asignado'].includes(s.status)) throw bad('Solo puedes cancelar envíos que aún no se han recogido');
  await query("UPDATE shipments SET status='cancelado', updated_at=now() WHERE id=$1", [s.id]);
  await addEvent(s.id, 'cancelado', req.user.id, { note: req.body?.note });
  await shipmentChanged(s.id, 'cancelado', { actorId: req.user.id });
  res.json({ ok: true });
}));

// Mensajero: envíos disponibles para tomar (sin mensajero), primero los de su ciudad.
shipmentsRouter.get('/courier/available', auth('mensajero'), h(async (req, res) => {
  const rows = await many(`SELECT s.*, st.name AS store_name, st.address AS store_address, st.city AS store_city FROM shipments s
    JOIN stores st ON st.id = s.store_id WHERE s.status = 'creado' AND s.courier_id IS NULL AND s.carrier = 'propia'
    ORDER BY (lower(st.city) = lower($1)) DESC, s.created_at LIMIT 100`, [req.user.city ?? '']);
  res.json(rows.map(shipmentOut));
}));

shipmentsRouter.post('/shipments/:id/accept', auth('mensajero'), h(async (req, res) => {
  const r = await one(`UPDATE shipments SET courier_id=$1, status='asignado', updated_at=now()
    WHERE id=$2 AND status='creado' AND courier_id IS NULL AND carrier='propia' RETURNING id`, [req.user.id, req.params.id]);
  if (!r) throw bad('Otro mensajero ya tomó este envío');
  await addEvent(r.id, 'asignado', req.user.id, { note: `Asignado a ${req.user.name}` });
  await shipmentChanged(r.id, 'asignado', { actorId: req.user.id });
  res.json({ ok: true });
}));

shipmentsRouter.post('/shipments/:id/status', auth('mensajero', 'admin'), h(async (req, res) => {
  const s = await getShipmentFor(req.user, req.params.id);
  const next = String(req.body?.status ?? '');
  if (!STATUS.includes(next)) throw bad('Estado inválido');
  if (req.user.role === 'mensajero') {
    if (s.courier_id !== req.user.id) throw forbidden();
    if (!(COURIER_FLOW[s.status] ?? []).includes(next)) throw bad(`No se puede pasar de «${STATUS_LABEL[s.status]}» a «${STATUS_LABEL[next]}»`);
    if (next === 'entregado' && !req.body?.receiverName) throw bad('Escribe quién recibió el paquete');
    if (next === 'novedad' && !req.body?.note) throw bad('Describe la novedad (p. ej. «no había nadie»)');
  }
  await query('UPDATE shipments SET status=$1, updated_at=now() WHERE id=$2', [next, s.id]);
  await addEvent(s.id, next, req.user.id, { note: req.body?.note, photo: req.body?.photo, receiverName: req.body?.receiverName });
  await shipmentChanged(s.id, next, { actorId: req.user.id, note: req.body?.note, receiver: req.body?.receiverName });
  res.json({ ok: true });
}));

/**
 * Verificación de medidas al recoger (el mensajero mide el paquete con AR).
 * Si el peso cobrable cambia, se registra el ajuste para la tienda.
 */
shipmentsRouter.post('/shipments/:id/verify', auth('mensajero', 'admin'), h(async (req, res) => {
  const s = shipmentOut(await getShipmentFor(req.user, req.params.id));
  const { length, width, height, weight } = req.body ?? {};
  const dims = [length, width, height].map(Number);
  if (dims.some((d) => !(d > 0 && d < 300))) throw bad('Medidas inválidas');
  const services = await loadServices(false);
  const svc = services.find((x) => x.id === s.service_id);
  const divisor = svc?.divisor ?? 5000;
  const declaredKg = s.quote?.chargeableKg ?? null;
  const realKg = Number(weight) || (s.packages ?? []).reduce((a, p) => a + p.contentWeightKg, 0);
  const measuredKg = chargeableKg(realKg, dims, divisor);
  const verified = {
    dims, weightKg: realKg, chargeableKg: measuredKg, declaredChargeableKg: declaredKg,
    matches: declaredKg == null || measuredKg <= declaredKg, at: new Date().toISOString(), by: req.user.name,
  };
  await query('UPDATE shipments SET verified=$1, updated_at=now() WHERE id=$2', [JSON.stringify(verified), s.id]);
  await addEvent(s.id, s.status, req.user.id, {
    note: verified.matches ? `Medidas verificadas con AR: ${dims.join(' × ')} cm ✓` : `Ajuste: el paquete mide ${dims.join(' × ')} cm (${measuredKg} kg cobrables, se declararon ${declaredKg})`,
  });
  if (!verified.matches) {
    const owner = await one('SELECT owner_id FROM stores WHERE id=$1', [s.store_id]);
    await notifyUsers([owner?.owner_id], { kind: 'envio.ajuste', title: `Ajuste de medidas · ${s.code}`,
      body: `El mensajero midió ${dims.join(' × ')} cm (${measuredKg} kg cobrables; se declararon ${declaredKg}).`, link: `/envio/${s.id}` });
  }
  res.json(verified);
}));

shipmentsRouter.post('/shipments/:id/assign', auth('admin'), h(async (req, res) => {
  const courier = await one("SELECT id, name FROM users WHERE id=$1 AND role='mensajero' AND active", [req.body?.courierId]);
  if (!courier) throw bad('Mensajero no válido');
  const s = await one("UPDATE shipments SET courier_id=$1, status=CASE WHEN status='creado' THEN 'asignado' ELSE status END, updated_at=now() WHERE id=$2 RETURNING id", [courier.id, req.params.id]);
  if (!s) throw notFound();
  await addEvent(s.id, 'asignado', req.user.id, { note: `Asignado por administración a ${courier.name}` });
  await shipmentChanged(s.id, 'asignado', { actorId: req.user.id });
  await notifyUsers([courier.id], { kind: 'asignacion', title: 'Te asignaron un envío', body: 'Administración te asignó un envío. Revisa la dirección de recogida.', link: `/envio/${s.id}` });
  res.json({ ok: true });
}));

// Agendar la recogida con la transportadora (tienda o administración).
shipmentsRouter.post('/shipments/:id/pickup', auth('tienda', 'admin'), h(async (req, res) => {
  const s = await getShipmentFor(req.user, req.params.id);
  if (s.carrier === 'propia') throw bad('Los envíos de la red DIMENSIONA los recoge un mensajero; no necesitan agendarse');
  if (s.status !== 'creado') throw bad('La recogida solo se agenda antes de que el paquete salga');
  const date = String(req.body?.date ?? '');
  const window = ['manana', 'tarde'].includes(req.body?.window) ? req.body.window : 'manana';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Fecha inválida (AAAA-MM-DD)');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime()) || d < today || d - today > 15 * 86_400_000) throw bad('Elige una fecha entre hoy y los próximos 15 días');
  if (d.getDay() === 0) throw bad('Las transportadoras no recogen los domingos');
  const store = await one('SELECT * FROM stores WHERE id=$1', [s.store_id]);
  const p = await schedulePickup(s.carrier, { guide: s.carrier_guide, date, window, store });
  const pickup = { ...p, scheduledAt: new Date().toISOString() };
  await query('UPDATE shipments SET pickup=$1, carrier_synced=0, updated_at=now() WHERE id=$2', [JSON.stringify(pickup), s.id]);
  await addEvent(s.id, s.status, req.user.id, { note: `Recogida ${carrierInfo(s.carrier).name} agendada para el ${date} en la ${window === 'manana' ? 'mañana (8–12 h)' : 'tarde (14–18 h)'} · ${p.id}` });
  res.json(pickup);
}));

shipmentsRouter.get('/carriers', auth(), h(async (_req, res) => res.json(listCarriers())));

// Rastreo público (cliente final): sin datos sensibles.
shipmentsRouter.get('/track/:code', h(async (req, res) => {
  const q = `SELECT s.id, s.code, s.status, s.city, s.zone, s.created_at, s.updated_at, s.quote, s.recipient_name, s.carrier, s.carrier_guide, s.pickup, s.carrier_synced, s.recipient_opt_out,
      st.name AS store_name, u.name AS courier_name
    FROM shipments s JOIN stores st ON st.id = s.store_id LEFT JOIN users u ON u.id = s.courier_id WHERE upper(s.code) = upper($1) OR s.carrier_guide = $1`;
  let s = await one(q, [String(req.params.code).trim()]);
  if (!s) throw notFound('No encontramos esa guía. Revisa el código.');
  if (await syncCarrier(s)) s = await one(q, [String(req.params.code).trim()]);
  const events = await many('SELECT status, note, receiver_name, created_at FROM shipment_events WHERE shipment_id=$1 ORDER BY created_at', [s.id]);
  const first = (n) => String(n ?? '').split(' ')[0];
  const quote = parse(s.quote);
  res.json({
    code: s.code, status: s.status, status_label: STATUS_LABEL[s.status], city: s.city, store: s.store_name,
    recipient: first(s.recipient_name), courier: s.courier_name ? first(s.courier_name) : null,
    service: quote?.serviceName, etaDays: quote?.etaDays,
    carrier: s.carrier !== 'propia' ? { name: carrierInfo(s.carrier).name, guide: s.carrier_guide } : null, created_at: s.created_at, updated_at: s.updated_at,
    notifications: !s.recipient_opt_out,
    events: events.map((e) => ({ status: e.status, status_label: STATUS_LABEL[e.status], note: e.note, receiver: e.receiver_name ? first(e.receiver_name) : null, at: e.created_at })),
  });
}));

// Resumen por rol
shipmentsRouter.get('/stats', auth(), h(async (req, res) => {
  const u = req.user;
  if (u.role === 'tienda') {
    const r = await one(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status IN ('creado','asignado','recogido','en_ruta','novedad'))::int AS activos,
        count(*) FILTER (WHERE status = 'entregado')::int AS entregados,
        count(*) FILTER (WHERE status = 'novedad')::int AS novedades,
        coalesce(sum(price) FILTER (WHERE status <> 'cancelado'),0)::float AS gasto,
        coalesce(sum(greatest(baseline_total - price, 0)) FILTER (WHERE status <> 'cancelado'),0)::float AS ahorro,
        coalesce(sum(cod_amount) FILTER (WHERE status = 'entregado'),0)::float AS recaudo
      FROM shipments WHERE store_id = $1`, [req.store.id]);
    const products = await one('SELECT count(*)::int AS n, count(*) FILTER (WHERE measured_by IN (\'ar\',\'foto\',\'ia\'))::int AS medidos FROM products WHERE store_id=$1', [req.store.id]);
    const fill = await many("SELECT packages FROM shipments WHERE store_id=$1 AND status <> 'cancelado' ORDER BY created_at DESC LIMIT 50", [req.store.id]);
    const fills = fill.flatMap((f) => parse(f.packages).map((p) => p.fillPct));
    return res.json({ ...r, productos: products.n, productosMedidos: products.medidos, llenadoPromedio: fills.length ? Math.round(fills.reduce((a, b) => a + b, 0) / fills.length) : null });
  }
  if (u.role === 'mensajero') {
    const r = await one(`SELECT count(*) FILTER (WHERE status IN ('asignado','recogido','en_ruta','novedad'))::int AS activos,
        count(*) FILTER (WHERE status = 'entregado')::int AS entregados,
        count(*) FILTER (WHERE status = 'entregado' AND updated_at::date = now()::date)::int AS "entregadosHoy",
        coalesce(sum(courier_fee) FILTER (WHERE status = 'entregado'),0)::float AS ganancias,
        coalesce(sum(cod_amount) FILTER (WHERE status = 'entregado'),0)::float AS recaudo
      FROM shipments WHERE courier_id = $1`, [u.id]);
    const disp = await one("SELECT count(*)::int AS n FROM shipments WHERE status='creado' AND courier_id IS NULL");
    return res.json({ ...r, disponibles: disp.n });
  }
  const r = await one(`SELECT count(*)::int AS envios,
      count(*) FILTER (WHERE status IN ('creado','asignado','recogido','en_ruta','novedad'))::int AS activos,
      count(*) FILTER (WHERE status = 'creado' AND courier_id IS NULL)::int AS "sinAsignar",
      count(*) FILTER (WHERE status = 'novedad')::int AS novedades,
      count(*) FILTER (WHERE status = 'entregado')::int AS entregados,
      coalesce(sum(price) FILTER (WHERE status <> 'cancelado'),0)::float AS facturado,
      coalesce(sum(price - courier_fee) FILTER (WHERE status <> 'cancelado'),0)::float AS margen,
      coalesce(sum(greatest(baseline_total - price, 0)) FILTER (WHERE status <> 'cancelado'),0)::float AS "ahorroClientes"
    FROM shipments`);
  const users = await one(`SELECT count(*) FILTER (WHERE role='tienda')::int AS tiendas, count(*) FILTER (WHERE role='mensajero' AND active)::int AS mensajeros,
      count(*) FILTER (WHERE role='mensajero' AND NOT active)::int AS pendientes FROM users`);
  const billing = await one(`SELECT count(*) FILTER (WHERE invoice_id IS NULL AND status <> 'cancelado' AND created_at < date_trunc('month', now()))::int AS "sinFacturarMesAnterior",
      (SELECT count(*)::int FROM invoices WHERE status = 'pendiente' AND due_at < now()) AS "facturasVencidas",
      (SELECT count(*)::int FROM settlements WHERE status = 'pendiente') AS "liquidacionesPendientes",
      (SELECT count(*)::int FROM claims WHERE status <> 'cerrada') AS "pqrAbiertas",
      (SELECT count(*)::int FROM claims WHERE status <> 'cerrada' AND due_at < now() + interval '3 days') AS "pqrPorVencer"
    FROM shipments`);
  const byStatus = await many('SELECT status, count(*)::int AS n FROM shipments GROUP BY status');
  const byZone = await many("SELECT zone, count(*)::int AS n FROM shipments WHERE status <> 'cancelado' GROUP BY zone");
  res.json({ ...r, ...users, ...billing, byStatus, byZone });
}));

// El destinatario deja de recibir avisos de este envío (enlace del mensaje / página de rastreo).
shipmentsRouter.post('/track/:code/opt-out', h(async (req, res) => {
  const r = await one('UPDATE shipments SET recipient_opt_out=true WHERE upper(code)=upper($1) RETURNING id', [String(req.params.code).trim()]);
  if (!r) throw notFound('No encontramos esa guía');
  res.json({ ok: true });
}));

/**
 * Recorrido demo: con las cuentas demo, la tienda ve en vivo el uso completo de la plataforma.
 * El mensajero demo acepta el envío, verifica las medidas con AR, lo recoge, sale a ruta, reporta una
 * novedad (avisa a administración), reintenta y entrega. Cada paso genera los mismos avisos que un envío real
 * (tienda, administración y WhatsApp al cliente). Un paso cada DEMO_STEP_SECONDS (6 s por defecto).
 * Solo con SEED_DEMO activo y cuentas @demo.app.
 */
const simulating = new Set();
shipmentsRouter.post('/demo/shipments/:id/simulate', auth('tienda'), h(async (req, res) => {
  if (!config.seedDemo || !req.user.email.endsWith('@demo.app')) throw forbidden('La simulación solo está disponible para las cuentas demo');
  const s = shipmentOut(await getShipmentFor(req.user, req.params.id));
  if (s.carrier !== 'propia') throw bad('La simulación es para envíos de la red DIMENSIONA');
  if (s.status !== 'creado' || s.courier_id) throw bad('Solo se simula un envío recién creado');
  if (simulating.has(s.id)) throw bad('Este envío ya se está simulando');
  const courier = await one("SELECT id, name FROM users WHERE email='mensajero@demo.app' AND active");
  if (!courier) throw bad('No existe el mensajero demo');
  simulating.add(s.id);
  const stepMs = Number(process.env.DEMO_STEP_SECONDS ?? 6) * 1000;
  const first = String(s.recipient_name).split(' ')[0];
  const move = (status, note, extra = {}) => async () => {
    await query('UPDATE shipments SET status=$1, updated_at=now() WHERE id=$2', [status, s.id]);
    await addEvent(s.id, status, courier.id, { note, receiverName: extra.receiver });
    await shipmentChanged(s.id, status, { actorId: courier.id, note, receiver: extra.receiver });
  };
  const steps = [
    async () => {
      await query("UPDATE shipments SET courier_id=$1, status='asignado', updated_at=now() WHERE id=$2", [courier.id, s.id]);
      await addEvent(s.id, 'asignado', courier.id, { note: `${courier.name} aceptó el envío desde «Disponibles»` });
      await shipmentChanged(s.id, 'asignado', { actorId: courier.id });
    },
    async () => {
      const b = s.packages?.[0]?.box ?? { length: 20, width: 15, height: 10 };
      const dims = [b.length, b.width, b.height].map(Number);
      const kg = s.quote?.chargeableKg ?? null;
      const verified = { dims, weightKg: null, chargeableKg: kg, declaredChargeableKg: kg, matches: true, at: new Date().toISOString(), by: courier.name };
      await query('UPDATE shipments SET verified=$1, updated_at=now() WHERE id=$2', [JSON.stringify(verified), s.id]);
      await addEvent(s.id, 'asignado', courier.id, { note: `Medidas verificadas con AR: ${dims.join(' × ')} cm ✓` });
    },
    move('recogido', 'Paquete recogido en la tienda'),
    move('en_ruta', 'Saliendo hacia el destino'),
    move('novedad', `Portería cerrada: el mensajero llama a ${first} y reintenta`),
    move('en_ruta', 'Reintento de entrega'),
    move('entregado', 'Entrega confirmada con foto de evidencia', { receiver: s.recipient_name }),
  ];
  (async () => {
    try {
      for (const step of steps) {
        await new Promise((r) => setTimeout(r, stepMs));
        const cur = await one('SELECT status FROM shipments WHERE id=$1', [s.id]);
        if (!cur || cur.status === 'cancelado') break;
        await step();
      }
    } catch (e) { console.error('[demo]', e.message); } finally { simulating.delete(s.id); }
  })();
  res.json({ ok: true, stepSeconds: stepMs / 1000, steps: steps.length });
}));
