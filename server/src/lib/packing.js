/**
 * Optimizador de embalaje (lógica pura, sin dependencias).
 * Unidades: centímetros y kilogramos.
 *
 * Algoritmo: empaque 3D por "puntos extremos" (extreme points) con las 6 rotaciones de cada
 * artículo, de mayor a menor volumen. Para cada caja del catálogo (de menor a mayor volumen) se
 * intenta acomodar todo; la primera que lo logra es la recomendada. Si ninguna alcanza, se reparte
 * en varios paquetes (codicioso). Además se propone una "caja a medida" ajustada al contenido.
 */

/** Relleno de protección por lado (cm) según fragilidad. */
export const PADDING_CM = { normal: 0.5, fragil: 2 };
/** Holgura mínima entre el contenido y la pared de la caja (cm por lado). */
export const WALL_CLEARANCE_CM = 0.5;
export const MAX_UNITS = 80;

const EPS = 1e-6;

/** Rotaciones únicas de un paralelepípedo [l, w, h]. */
export function orientations([a, b, c]) {
  const all = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  const seen = new Set();
  return all.filter((d) => {
    const k = d.join('x');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Dimensiones de un artículo con su relleno de protección. */
export function paddedDims(item) {
  const pad = 2 * (item.fragile ? PADDING_CM.fragil : PADDING_CM.normal);
  return [item.length + pad, item.width + pad, item.height + pad];
}

/** Expande cantidades a unidades individuales (con tope para no colgar el servidor). */
export function expandUnits(items) {
  const units = [];
  for (const it of items) {
    const qty = Math.max(1, Math.floor(it.qty ?? 1));
    for (let i = 0; i < qty; i++) {
      units.push({ ...it, qty: 1, dims: paddedDims(it), weight: Number(it.weight ?? 0) });
      if (units.length > MAX_UNITS) throw new Error(`Máximo ${MAX_UNITS} unidades por envío`);
    }
  }
  return units;
}

const overlap = (a, b) =>
  a.x < b.x + b.l - EPS && b.x < a.x + a.l - EPS &&
  a.y < b.y + b.w - EPS && b.y < a.y + a.w - EPS &&
  a.z < b.z + b.h - EPS && b.z < a.z + a.h - EPS;

/**
 * Intenta acomodar las unidades en un espacio interior [L, W, H].
 * Devuelve { placed, rest } (las que entraron y las que no).
 */
export function packUnits(units, [L, W, H]) {
  const inner = [L - 2 * WALL_CLEARANCE_CM, W - 2 * WALL_CLEARANCE_CM, H - 2 * WALL_CLEARANCE_CM];
  const sorted = [...units].sort((p, q) => q.dims[0] * q.dims[1] * q.dims[2] - p.dims[0] * p.dims[1] * p.dims[2]);
  const placed = [];
  const rest = [];
  let points = [{ x: 0, y: 0, z: 0 }];
  for (const u of sorted) {
    let done = false;
    // Primero los puntos más bajos y al fondo: cajas más estables.
    points.sort((p, q) => p.z - q.z || p.y - q.y || p.x - q.x);
    for (let pi = 0; pi < points.length && !done; pi++) {
      const pt = points[pi];
      for (const [l, w, h] of orientations(u.dims)) {
        if (pt.x + l > inner[0] + EPS || pt.y + w > inner[1] + EPS || pt.z + h > inner[2] + EPS) continue;
        const cand = { x: pt.x, y: pt.y, z: pt.z, l, w, h };
        if (placed.some((p) => overlap(cand, p))) continue;
        placed.push({ ...cand, unit: u });
        points.splice(pi, 1);
        points.push({ x: pt.x + l, y: pt.y, z: pt.z }, { x: pt.x, y: pt.y + w, z: pt.z }, { x: pt.x, y: pt.y, z: pt.z + h });
        done = true;
        break;
      }
    }
    if (!done) rest.push(u);
  }
  // Quita puntos que quedaron dentro de otras cajas (limpieza, no afecta el resultado).
  points = points.filter((pt) => !placed.some((p) => pt.x > p.x && pt.x < p.x + p.l && pt.y > p.y && pt.y < p.y + p.w && pt.z > p.z && pt.z < p.z + p.h));
  return { placed, rest };
}

export const volume = ([l, w, h]) => l * w * h;
const round1 = (n) => Math.round(n * 10) / 10;

/** Medidas exteriores de la caja a medida que envuelve lo acomodado. */
export function boundingDims(placed) {
  const ext = [0, 0, 0];
  for (const p of placed) {
    ext[0] = Math.max(ext[0], p.x + p.l);
    ext[1] = Math.max(ext[1], p.y + p.w);
    ext[2] = Math.max(ext[2], p.z + p.h);
  }
  return ext.map((v) => Math.ceil(v + 2 * WALL_CLEARANCE_CM));
}

function describe(box, placed) {
  const dims = [box.length, box.width, box.height];
  const itemsVol = placed.reduce((s, p) => s + p.l * p.w * p.h, 0);
  const weight = placed.reduce((s, p) => s + p.unit.weight, 0);
  return {
    box: { id: box.id ?? null, name: box.name, length: box.length, width: box.width, height: box.height, cost: Number(box.cost ?? 0), custom: !!box.custom },
    units: placed.length,
    fillPct: round1((itemsVol / volume(dims)) * 100),
    voidCm3: Math.round(volume(dims) - itemsVol),
    contentWeightKg: Math.round(weight * 1000) / 1000,
    placements: placed.map((p) => ({ name: p.unit.name ?? 'Artículo', x: round1(p.x), y: round1(p.y), z: round1(p.z), l: round1(p.l), w: round1(p.w), h: round1(p.h) })),
  };
}

/**
 * Recomienda el embalaje.
 * @param items [{ name, length, width, height, weight, qty, fragile }]
 * @param boxes catálogo [{ id, name, length, width, height, maxWeight, cost }] (medidas interiores)
 * @returns { packages: [...], custom, totalUnits }
 */
export function recommendPacking(items, boxes) {
  if (!Array.isArray(items) || !items.length) throw new Error('Agrega al menos un producto');
  for (const it of items) {
    for (const k of ['length', 'width', 'height']) {
      if (!(Number(it[k]) > 0)) throw new Error(`Medida inválida (${k}) en ${it.name ?? 'producto'}`);
    }
  }
  const units = expandUnits(items.map((it) => ({ ...it, length: +it.length, width: +it.width, height: +it.height })));
  const catalog = [...boxes].filter((b) => b.active !== false).sort((a, b) => volume([a.length, a.width, a.height]) - volume([b.length, b.width, b.height]));
  const packages = [];
  let pending = units;

  while (pending.length) {
    const pendingWeight = pending.reduce((s, u) => s + u.weight, 0);
    let chosen = null;
    for (const box of catalog) {
      if (box.maxWeight && pendingWeight > box.maxWeight) continue;
      const r = packUnits(pending, [box.length, box.width, box.height]);
      if (!r.rest.length) { chosen = { box, ...r }; break; }
    }
    if (!chosen) {
      // Ninguna caja admite todo: llenar la que más acomode y repetir con lo que sobre.
      let best = null;
      for (const box of catalog) {
        const r = packUnits(pending, [box.length, box.width, box.height]);
        const w = r.placed.reduce((s, p) => s + p.unit.weight, 0);
        if (!r.placed.length || (box.maxWeight && w > box.maxWeight)) continue;
        const vol = r.placed.reduce((s, p) => s + p.l * p.w * p.h, 0);
        if (!best || vol > best.vol) best = { box, ...r, vol };
      }
      if (!best) {
        // Ni una unidad entra en el catálogo: caja a medida para cada unidad sobrante.
        const u = pending[0];
        const dims = u.dims.map((d) => Math.ceil(d + 2 * WALL_CLEARANCE_CM));
        const box = { name: 'Caja a medida', length: dims[0], width: dims[1], height: dims[2], cost: estimateBoxCost(dims), custom: true };
        chosen = { box, ...packUnits([u], dims) };
      } else chosen = best;
    }
    packages.push(describe(chosen.box, chosen.placed));
    pending = chosen.rest;
  }

  // Alternativa: una sola caja a medida, útil cuando el catálogo deja mucho aire.
  let custom = null;
  const bigSide = Math.max(...units.map((u) => Math.max(...u.dims)));
  const sumVol = units.reduce((s, u) => s + volume(u.dims), 0);
  const side = Math.max(bigSide, Math.cbrt(sumVol) * 1.6);
  const r = packUnits(units, [side * 3, side * 3, side * 3]);
  if (!r.rest.length) {
    const dims = boundingDims(r.placed);
    custom = describe({ name: 'Caja a medida', length: dims[0], width: dims[1], height: dims[2], cost: estimateBoxCost(dims), custom: true }, r.placed);
  }
  return { packages, custom, totalUnits: units.length };
}

/** Costo aproximado de cartón para una caja a medida (COP), según su superficie. */
export function estimateBoxCost([l, w, h]) {
  const areaM2 = (2 * (l * w + l * h + w * h)) / 10000;
  return Math.round((800 + areaM2 * 3500) / 100) * 100;
}
