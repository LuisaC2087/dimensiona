/** Servicio de envíos: creación, ciclo de vida, mensajeros, verificación de medidas y rastreo público. */
import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { auth, bad, forbidden, h, notFound, nums } from '../auth.js';
import { many, one, query } from '../db.js';
import { chargeableKg } from '../lib/pricing.js';
import { buildPlan } from './logistics.js';
import { loadServices } from './catalog.js';

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
  const plan = await buildPlan({
    storeId: store.id, originCity: store.city, items: b.items, destCity: city,
    declaredValue: Number(b.declaredValue) || 0, codAmount: Number(b.codAmount) || 0, packing: b.packing,
  });
  if (!plan.quotes.length) throw bad('No hay servicios disponibles para ese destino');
  const quote = (b.serviceId && plan.quotes.find((q) => q.serviceId === b.serviceId)) || plan.quotes[0];
  const service = (await loadServices()).find((s) => s.id === quote.serviceId);
  const courierFee = Math.round((quote.freight * (service?.courierSharePct ?? 70)) / 100 / 50) * 50;
  let code;
  for (let i = 0; i < 5; i++) {
    code = newCode();
    if (!(await one('SELECT 1 FROM shipments WHERE code = $1', [code]))) break;
  }
  const row = await one(
    `INSERT INTO shipments (code, store_id, service_id, recipient_name, recipient_phone, address, city, zone, notes, items, packages, quote,
       baseline_total, declared_value, cod_amount, price, courier_fee)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [code, store.id, quote.serviceId, recipientName, recipientPhone, address, city, plan.zone, clean(b.notes, 300) || null,
      JSON.stringify(plan.items), JSON.stringify(plan.packages), JSON.stringify(quote),
      quote.baselineTotal ?? null,
      plan.declaredValue, Number(b.codAmount) || 0, quote.total, courierFee]);
  await query('INSERT INTO shipment_events (shipment_id, status, note, by_user) VALUES ($1,$2,$3,$4)', [row.id, 'creado', 'Guía creada', userId]);
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
  const s = await getShipmentFor(req.user, req.params.id);
  const events = await many(`SELECT e.id, e.status, e.note, e.photo, e.receiver_name, e.created_at, u.name AS by_name
    FROM shipment_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.shipment_id = $1 ORDER BY e.created_at`, [s.id]);
  res.json({ ...shipmentOut(s), events: events.map((e) => ({ ...e, status_label: STATUS_LABEL[e.status] })) });
}));

shipmentsRouter.post('/shipments/:id/cancel', auth('tienda', 'admin'), h(async (req, res) => {
  const s = await getShipmentFor(req.user, req.params.id);
  if (!['creado', 'asignado'].includes(s.status)) throw bad('Solo puedes cancelar envíos que aún no se han recogido');
  await query("UPDATE shipments SET status='cancelado', updated_at=now() WHERE id=$1", [s.id]);
  await addEvent(s.id, 'cancelado', req.user.id, { note: req.body?.note });
  res.json({ ok: true });
}));

// Mensajero: envíos disponibles para tomar (sin mensajero), primero los de su ciudad.
shipmentsRouter.get('/courier/available', auth('mensajero'), h(async (req, res) => {
  const rows = await many(`SELECT s.*, st.name AS store_name, st.address AS store_address, st.city AS store_city FROM shipments s
    JOIN stores st ON st.id = s.store_id WHERE s.status = 'creado' AND s.courier_id IS NULL
    ORDER BY (lower(st.city) = lower($1)) DESC, s.created_at LIMIT 100`, [req.user.city ?? '']);
  res.json(rows.map(shipmentOut));
}));

shipmentsRouter.post('/shipments/:id/accept', auth('mensajero'), h(async (req, res) => {
  const r = await one(`UPDATE shipments SET courier_id=$1, status='asignado', updated_at=now()
    WHERE id=$2 AND status='creado' AND courier_id IS NULL RETURNING id`, [req.user.id, req.params.id]);
  if (!r) throw bad('Otro mensajero ya tomó este envío');
  await addEvent(r.id, 'asignado', req.user.id, { note: `Asignado a ${req.user.name}` });
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
  res.json(verified);
}));

shipmentsRouter.post('/shipments/:id/assign', auth('admin'), h(async (req, res) => {
  const courier = await one("SELECT id, name FROM users WHERE id=$1 AND role='mensajero' AND active", [req.body?.courierId]);
  if (!courier) throw bad('Mensajero no válido');
  const s = await one("UPDATE shipments SET courier_id=$1, status=CASE WHEN status='creado' THEN 'asignado' ELSE status END, updated_at=now() WHERE id=$2 RETURNING id", [courier.id, req.params.id]);
  if (!s) throw notFound();
  await addEvent(s.id, 'asignado', req.user.id, { note: `Asignado por administración a ${courier.name}` });
  res.json({ ok: true });
}));

// Rastreo público (cliente final): sin datos sensibles.
shipmentsRouter.get('/track/:code', h(async (req, res) => {
  const s = await one(`SELECT s.id, s.code, s.status, s.city, s.zone, s.created_at, s.updated_at, s.quote, s.recipient_name, st.name AS store_name, u.name AS courier_name
    FROM shipments s JOIN stores st ON st.id = s.store_id LEFT JOIN users u ON u.id = s.courier_id WHERE upper(s.code) = upper($1)`, [String(req.params.code).trim()]);
  if (!s) throw notFound('No encontramos esa guía. Revisa el código.');
  const events = await many('SELECT status, note, receiver_name, created_at FROM shipment_events WHERE shipment_id=$1 ORDER BY created_at', [s.id]);
  const first = (n) => String(n ?? '').split(' ')[0];
  const quote = parse(s.quote);
  res.json({
    code: s.code, status: s.status, status_label: STATUS_LABEL[s.status], city: s.city, store: s.store_name,
    recipient: first(s.recipient_name), courier: s.courier_name ? first(s.courier_name) : null,
    service: quote?.serviceName, etaDays: quote?.etaDays, created_at: s.created_at, updated_at: s.updated_at,
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
  const byStatus = await many('SELECT status, count(*)::int AS n FROM shipments GROUP BY status');
  const byZone = await many("SELECT zone, count(*)::int AS n FROM shipments WHERE status <> 'cancelado' GROUP BY zone");
  res.json({ ...r, ...users, byStatus, byZone });
}));
