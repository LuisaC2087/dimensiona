/**
 * Servicio de facturación y liquidaciones.
 * - Factura mensual por tienda con todos sus envíos no anulados del periodo (precios con IVA incluido).
 *   Es un documento de cobro interno: la factura electrónica ante la DIAN debe emitirse con un
 *   proveedor tecnológico autorizado (ver README).
 * - Liquidaciones: recaudos contra entrega que se le pagan a la tienda y pagos a mensajeros.
 */
import { Router } from 'express';
import { auth, bad, h, notFound } from '../auth.js';
import { many, one, query } from '../db.js';
import { audit } from './audit.js';

export const IVA_PCT = Number(process.env.BILLING_IVA_PCT ?? 19);
const PREFIX = process.env.BILLING_PREFIX ?? 'DM';
const DUE_DAYS = 15;

const NUMS = ['subtotal', 'iva', 'total', 'amount'];
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
export const invoiceOut = (r) => {
  if (!r) return r;
  const o = { ...r };
  for (const k of NUMS) if (o[k] != null) o[k] = Number(o[k]);
  if (o.items) o.items = parse(o.items);
  return o;
};

/** Desglosa un total con IVA incluido. */
export function splitIva(total, pct = IVA_PCT) {
  const subtotal = Math.round(total / (1 + pct / 100));
  return { subtotal, iva: total - subtotal, total };
}

export function periodRange(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw bad('Periodo inválido (AAAA-MM)');
  const [y, m] = period.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
}

/** Genera las facturas del periodo para todas las tiendas con envíos sin facturar. */
export async function runBilling(period, userId) {
  const { from, to } = periodRange(period);
  const rows = await many(`SELECT id, code, store_id, created_at, city, price, quote FROM shipments
    WHERE invoice_id IS NULL AND status <> 'cancelado' AND created_at >= $1 AND created_at < $2 ORDER BY created_at`, [from, to]);
  const byStore = new Map();
  for (const r of rows) byStore.set(r.store_id, [...(byStore.get(r.store_id) ?? []), r]);
  const created = [];
  for (const [storeId, list] of byStore) {
    const total = list.reduce((s, r) => s + Number(r.price), 0);
    const { subtotal, iva } = splitIva(total);
    const seq = await one("SELECT nextval('invoice_number_seq')::int AS n");
    const number = `${PREFIX}-${String(seq.n).padStart(6, '0')}`;
    const items = list.map((r) => ({ shipmentId: r.id, code: r.code, date: r.created_at, city: r.city, service: parse(r.quote)?.serviceName, total: Number(r.price) }));
    const inv = await one(`INSERT INTO invoices (number, store_id, period, items, subtotal, iva, total, due_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '${DUE_DAYS} days') RETURNING *`, [number, storeId, period, JSON.stringify(items), subtotal, iva, total]);
    await query('UPDATE shipments SET invoice_id=$1 WHERE id = ANY($2::uuid[])', [inv.id, list.map((r) => r.id)]);
    created.push(invoiceOut(inv));
  }
  await audit(userId, 'billing.run', period, { invoices: created.length });
  return created;
}

/** Crea liquidaciones pendientes: recaudos para tiendas y pagos para mensajeros. */
export async function runSettlements(userId) {
  const out = [];
  const cod = await many(`SELECT store_id, array_agg(id) AS ids, sum(cod_amount)::float AS amount FROM shipments
    WHERE status='entregado' AND cod_amount > 0 AND cod_settlement_id IS NULL GROUP BY store_id`);
  for (const r of cod) {
    const s = await one("INSERT INTO settlements (kind, store_id, amount, shipments) VALUES ('tienda',$1,$2,$3) RETURNING *", [r.store_id, r.amount, r.ids.length]);
    await query('UPDATE shipments SET cod_settlement_id=$1 WHERE id = ANY($2::uuid[])', [s.id, r.ids]);
    out.push(invoiceOut(s));
  }
  const fees = await many(`SELECT courier_id, array_agg(id) AS ids, sum(courier_fee)::float AS amount FROM shipments
    WHERE status='entregado' AND courier_id IS NOT NULL AND courier_fee > 0 AND courier_settlement_id IS NULL GROUP BY courier_id`);
  for (const r of fees) {
    const s = await one("INSERT INTO settlements (kind, courier_id, amount, shipments) VALUES ('mensajero',$1,$2,$3) RETURNING *", [r.courier_id, r.amount, r.ids.length]);
    await query('UPDATE shipments SET courier_settlement_id=$1 WHERE id = ANY($2::uuid[])', [s.id, r.ids]);
    out.push(invoiceOut(s));
  }
  await audit(userId, 'settlements.run', null, { created: out.length });
  return out;
}

export const billingRouter = Router();

// Resumen de facturación de la tienda
billingRouter.get('/billing', auth('tienda'), h(async (req, res) => {
  const invoices = (await many('SELECT * FROM invoices WHERE store_id=$1 ORDER BY issued_at DESC', [req.store.id])).map(invoiceOut);
  const unbilled = await one(`SELECT count(*)::int AS envios, coalesce(sum(price),0)::float AS total FROM shipments
    WHERE store_id=$1 AND invoice_id IS NULL AND status <> 'cancelado'`, [req.store.id]);
  const settlements = (await many("SELECT * FROM settlements WHERE kind='tienda' AND store_id=$1 ORDER BY created_at DESC", [req.store.id])).map(invoiceOut);
  const codPending = await one(`SELECT coalesce(sum(cod_amount),0)::float AS total FROM shipments
    WHERE store_id=$1 AND status='entregado' AND cod_amount > 0 AND cod_settlement_id IS NULL`, [req.store.id]);
  const owed = invoices.filter((i) => i.status === 'pendiente').reduce((s, i) => s + i.total, 0);
  res.json({ ivaPct: IVA_PCT, invoices, unbilled: { ...unbilled, ...splitIva(unbilled.total) }, owed, settlements, codPending: codPending.total });
}));

billingRouter.get('/invoices/:id', auth('tienda', 'admin'), h(async (req, res) => {
  const inv = invoiceOut(await one(`SELECT i.*, s.name AS store_name, s.city AS store_city, s.address AS store_address, u.email AS store_email
    FROM invoices i JOIN stores s ON s.id = i.store_id JOIN users u ON u.id = s.owner_id WHERE i.id=$1`, [req.params.id]));
  if (!inv || (req.user.role === 'tienda' && inv.store_id !== req.store.id)) throw notFound('Factura no encontrada');
  res.json(inv);
}));

// Pagos del mensajero
billingRouter.get('/payouts', auth('mensajero'), h(async (req, res) => {
  const list = (await many("SELECT * FROM settlements WHERE kind='mensajero' AND courier_id=$1 ORDER BY created_at DESC", [req.user.id])).map(invoiceOut);
  const pending = await one(`SELECT coalesce(sum(courier_fee),0)::float AS total, count(*)::int AS envios FROM shipments
    WHERE courier_id=$1 AND status='entregado' AND courier_settlement_id IS NULL`, [req.user.id]);
  const codHeld = await one(`SELECT coalesce(sum(cod_amount),0)::float AS total FROM shipments
    WHERE courier_id=$1 AND status='entregado' AND cod_amount > 0 AND cod_settlement_id IS NULL`, [req.user.id]);
  res.json({ settlements: list, pending, codHeld: codHeld.total });
}));

// ─── Administración ───
billingRouter.post('/admin/billing/run', auth('admin'), h(async (req, res) => {
  const period = String(req.body?.period ?? new Date().toISOString().slice(0, 7));
  res.json({ period, invoices: await runBilling(period, req.user.id) });
}));
billingRouter.get('/admin/invoices', auth('admin'), h(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const rows = await many(`SELECT i.id, i.number, i.period, i.subtotal, i.iva, i.total, i.status, i.issued_at, i.due_at, i.paid_at, s.name AS store_name
    FROM invoices i JOIN stores s ON s.id = i.store_id ${status ? 'WHERE i.status = $1' : ''} ORDER BY i.issued_at DESC LIMIT 300`, status ? [status] : []);
  res.json(rows.map(invoiceOut));
}));
billingRouter.post('/admin/invoices/:id/pay', auth('admin'), h(async (req, res) => {
  const r = await one("UPDATE invoices SET status='pagada', paid_at=now(), payment_ref=$1 WHERE id=$2 AND status='pendiente' RETURNING id", [String(req.body?.ref ?? '').slice(0, 80) || null, req.params.id]);
  if (!r) throw bad('La factura no está pendiente');
  await audit(req.user.id, 'invoice.pay', req.params.id, { ref: req.body?.ref });
  res.json({ ok: true });
}));
billingRouter.post('/admin/invoices/:id/void', auth('admin'), h(async (req, res) => {
  const r = await one("UPDATE invoices SET status='anulada' WHERE id=$1 AND status='pendiente' RETURNING id", [req.params.id]);
  if (!r) throw bad('Solo se anulan facturas pendientes');
  await query('UPDATE shipments SET invoice_id=NULL WHERE invoice_id=$1', [req.params.id]); // vuelven a quedar por facturar
  await audit(req.user.id, 'invoice.void', req.params.id);
  res.json({ ok: true });
}));
billingRouter.post('/admin/settlements/run', auth('admin'), h(async (req, res) => res.json(await runSettlements(req.user.id))));
billingRouter.get('/admin/settlements', auth('admin'), h(async (_req, res) => {
  const rows = await many(`SELECT st.*, s.name AS store_name, u.name AS courier_name FROM settlements st
    LEFT JOIN stores s ON s.id = st.store_id LEFT JOIN users u ON u.id = st.courier_id ORDER BY st.status DESC, st.created_at DESC LIMIT 300`);
  res.json(rows.map(invoiceOut));
}));
billingRouter.post('/admin/settlements/:id/pay', auth('admin'), h(async (req, res) => {
  const r = await one("UPDATE settlements SET status='pagada', paid_at=now(), payment_ref=$1 WHERE id=$2 AND status='pendiente' RETURNING id", [String(req.body?.ref ?? '').slice(0, 80) || null, req.params.id]);
  if (!r) throw bad('La liquidación no está pendiente');
  await audit(req.user.id, 'settlement.pay', req.params.id, { ref: req.body?.ref });
  res.json({ ok: true });
}));
