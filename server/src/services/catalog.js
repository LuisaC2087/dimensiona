/** Servicio de catálogo: tienda, productos (medidos con AR/foto/manual) y cajas. */
import { Router } from 'express';
import { auth, bad, h, notFound, nums } from '../auth.js';
import { many, one, query } from '../db.js';

const PRODUCT_NUMS = ['length_cm', 'width_cm', 'height_cm', 'weight_kg', 'price', 'confidence'];
export const productOut = (p) => nums(p, PRODUCT_NUMS);

export async function loadBoxes(onlyActive = true) {
  const rows = await many(`SELECT * FROM boxes ${onlyActive ? 'WHERE active' : ''} ORDER BY length_cm * width_cm * height_cm`);
  return rows.map((b) => ({
    id: b.id, name: b.name, length: Number(b.length_cm), width: Number(b.width_cm), height: Number(b.height_cm),
    maxWeight: Number(b.max_weight_kg), cost: Number(b.cost), active: b.active,
  }));
}

export async function loadServices(onlyActive = true) {
  const rows = await many(`SELECT * FROM services ${onlyActive ? 'WHERE active' : ''} ORDER BY name`);
  return rows.map((s) => ({
    id: s.id, name: s.name, description: s.description, divisor: Number(s.divisor), insurancePct: Number(s.insurance_pct),
    minInsurance: Number(s.min_insurance), codPct: Number(s.cod_pct), courierSharePct: Number(s.courier_share_pct),
    rates: typeof s.rates === 'string' ? JSON.parse(s.rates) : s.rates, active: s.active,
  }));
}

const num = (v, name, { min = 0.1, max = 300 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} debe estar entre ${min} y ${max}`);
  return Math.round(n * 10) / 10;
};

function productInput(b) {
  const name = String(b.name ?? '').trim();
  if (!name) throw bad('El producto necesita un nombre');
  return {
    name: name.slice(0, 120),
    sku: b.sku ? String(b.sku).slice(0, 40) : null,
    category: b.category ? String(b.category).slice(0, 40) : null,
    length: num(b.length_cm ?? b.length, 'Largo'),
    width: num(b.width_cm ?? b.width, 'Ancho'),
    height: num(b.height_cm ?? b.height, 'Alto'),
    weight: num(b.weight_kg ?? b.weight ?? 0.2, 'Peso', { min: 0.01, max: 70 }),
    price: Math.max(0, Number(b.price ?? 0) || 0),
    fragile: !!b.fragile,
    measuredBy: ['ar', 'foto', 'manual', 'ia'].includes(b.measured_by) ? b.measured_by : 'manual',
    confidence: b.confidence == null ? null : Math.min(1, Math.max(0, Number(b.confidence))),
  };
}

export const catalogRouter = Router();

// Tienda propia
catalogRouter.get('/store', auth('tienda'), h(async (req, res) => res.json(req.store)));
catalogRouter.put('/store', auth('tienda'), h(async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? req.store.name).trim();
  const city = String(b.city ?? req.store.city).trim();
  if (!name || !city) throw bad('Nombre y ciudad son obligatorios');
  const row = await one(
    `UPDATE stores SET name=$1, city=$2, address=$3, channel=$4, instagram=$5, whatsapp=$6, default_box_id=$7 WHERE id=$8 RETURNING *`,
    [name, city, b.address ?? req.store.address, b.channel ?? req.store.channel, b.instagram ?? req.store.instagram,
      b.whatsapp ?? req.store.whatsapp, b.default_box_id ?? req.store.default_box_id, req.store.id]);
  res.json(row);
}));

// Productos
catalogRouter.get('/products', auth('tienda'), h(async (req, res) => {
  const rows = await many('SELECT * FROM products WHERE store_id = $1 ORDER BY updated_at DESC', [req.store.id]);
  res.json(rows.map(productOut));
}));
catalogRouter.post('/products', auth('tienda'), h(async (req, res) => {
  const p = productInput(req.body ?? {});
  const row = await one(
    `INSERT INTO products (store_id, name, sku, category, length_cm, width_cm, height_cm, weight_kg, price, fragile, measured_by, confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.store.id, p.name, p.sku, p.category, p.length, p.width, p.height, p.weight, p.price, p.fragile, p.measuredBy, p.confidence]);
  res.status(201).json(productOut(row));
}));
catalogRouter.put('/products/:id', auth('tienda'), h(async (req, res) => {
  const p = productInput(req.body ?? {});
  const row = await one(
    `UPDATE products SET name=$1, sku=$2, category=$3, length_cm=$4, width_cm=$5, height_cm=$6, weight_kg=$7, price=$8, fragile=$9,
       measured_by=$10, confidence=$11, updated_at=now() WHERE id=$12 AND store_id=$13 RETURNING *`,
    [p.name, p.sku, p.category, p.length, p.width, p.height, p.weight, p.price, p.fragile, p.measuredBy, p.confidence, req.params.id, req.store.id]);
  if (!row) throw notFound('Producto no encontrado');
  res.json(productOut(row));
}));
catalogRouter.delete('/products/:id', auth('tienda'), h(async (req, res) => {
  const r = await query('DELETE FROM products WHERE id=$1 AND store_id=$2', [req.params.id, req.store.id]);
  if (!r.rowCount && !r.affectedRows) throw notFound('Producto no encontrado');
  res.status(204).end();
}));

// Cajas y servicios (lectura para cualquier usuario con sesión)
catalogRouter.get('/boxes', auth(), h(async (_req, res) => res.json(await loadBoxes())));
catalogRouter.get('/services', auth(), h(async (_req, res) => res.json(await loadServices())));
