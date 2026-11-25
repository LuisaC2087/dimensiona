/** Servicio de embalaje y cotización: convierte productos medidos en paquetes y precios. */
import { Router } from 'express';
import { auth, bad, h } from '../auth.js';
import { many } from '../db.js';
import { recommendPacking } from '../lib/packing.js';
import { quoteAll } from '../lib/pricing.js';
import { loadBoxes, loadServices } from './catalog.js';

export const BOX_TARE_KG = 0.15;

/** Resuelve los artículos: { productId, qty } del catálogo de la tienda, o medidas sueltas. */
export async function resolveItems(storeId, items) {
  if (!Array.isArray(items) || !items.length) throw bad('Agrega al menos un producto');
  const ids = items.filter((i) => i.productId).map((i) => i.productId);
  const prods = ids.length && storeId ? await many('SELECT * FROM products WHERE store_id = $1 AND id = ANY($2::uuid[])', [storeId, ids]) : [];
  return items.map((i) => {
    const qty = Math.min(50, Math.max(1, Math.floor(Number(i.qty) || 1)));
    if (i.productId) {
      const p = prods.find((x) => x.id === i.productId);
      if (!p) throw bad('Producto no encontrado en tu catálogo');
      return {
        productId: p.id, name: p.name, qty, fragile: p.fragile, price: Number(p.price),
        length: Number(p.length_cm), width: Number(p.width_cm), height: Number(p.height_cm), weight: Number(p.weight_kg),
      };
    }
    return {
      name: String(i.name ?? 'Artículo').slice(0, 80), qty, fragile: !!i.fragile, price: Number(i.price) || 0,
      length: Number(i.length), width: Number(i.width), height: Number(i.height), weight: Number(i.weight) || 0.2,
    };
  });
}

const toQuotePkgs = (packages) => packages.map((p) => ({
  dims: [p.box.length, p.box.width, p.box.height],
  weightKg: p.contentWeightKg + BOX_TARE_KG,
}));

/**
 * Plan completo: embalaje recomendado + cotizaciones + comparación con "caja a ojo"
 * (una talla más grande del catálogo, lo que se suele elegir sin medir).
 */
export async function buildPlan({ storeId, originCity, items, destCity, declaredValue = 0, codAmount = 0, packing = 'catalogo' }) {
  const resolved = await resolveItems(storeId, items);
  const boxes = await loadBoxes();
  const services = await loadServices();
  const rec = recommendPacking(resolved, boxes);
  const useCustom = packing === 'medida' && rec.custom;
  const packages = useCustom ? [rec.custom] : rec.packages;
  const declared = declaredValue || resolved.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  const opts = { originCity, destCity, declaredValue: declared, codAmount: Number(codAmount) || 0 };
  const { zone, quotes } = quoteAll(services, toQuotePkgs(packages), opts);

  // Línea base para mostrar el ahorro de medir.
  // Catálogo: una talla más por paquete. A medida: la recomendación del catálogo.
  let baseline = null;
  const base = useCustom
    ? rec.packages.map((p) => ({ name: p.box.name, length: p.box.length, width: p.box.width, height: p.box.height, w: p.contentWeightKg }))
    : packages.map((p) => {
      const idx = boxes.findIndex((b) => b.id === p.box.id);
      const next = idx >= 0 ? boxes[idx + 1] : null;
      return next ? { ...next, w: p.contentWeightKg } : null;
    });
  if (base.every(Boolean) && quotes.length) {
    const bq = quoteAll(services, base.map((b) => ({ dims: [b.length, b.width, b.height], weightKg: b.w + BOX_TARE_KG })), opts);
    for (const q of quotes) {
      const same = bq.quotes.find((x) => x.serviceId === q.serviceId);
      if (same) q.baselineTotal = same.total;
    }
    const same = bq.quotes.find((q) => q.serviceId === quotes[0].serviceId);
    if (same) baseline = { boxes: base.map((b) => b.name), total: same.total, serviceId: same.serviceId };
  }
  const boxCost = packages.reduce((s, p) => s + p.box.cost, 0);
  return { items: resolved, packing: useCustom ? 'medida' : 'catalogo', packages, custom: rec.custom, zone, quotes, baseline, boxCost, declaredValue: declared };
}

export const logisticsRouter = Router();

logisticsRouter.post('/packing/recommend', auth(), h(async (req, res) => {
  const resolved = await resolveItems(req.store?.id, req.body?.items);
  res.json(recommendPacking(resolved, await loadBoxes()));
}));

logisticsRouter.post('/quotes', auth('tienda', 'admin'), h(async (req, res) => {
  const b = req.body ?? {};
  if (!b.destCity) throw bad('Indica la ciudad de destino');
  res.json(await buildPlan({
    storeId: req.store?.id, originCity: req.store?.city ?? b.originCity ?? 'Bogotá', items: b.items, destCity: b.destCity,
    declaredValue: Number(b.declaredValue) || 0, codAmount: Number(b.codAmount) || 0, packing: b.packing,
  }));
}));
