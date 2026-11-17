/**
 * CR-04: medida aproximada de cualquier objeto a partir de su recuadro en pantalla.
 * Se consultan puntos 3D (profundidad de ARCore) en los bordes del recuadro y se mide entre ellos.
 * Funciones puras; la consulta de puntos la hace la capa AR.
 */
import { distance3 } from './geometry';
import type { Point3 } from './types';

export interface ScreenBox { x: number; y: number; width: number; height: number } // dp
export type BoxProbe = 'left' | 'right' | 'top' | 'bottom' | 'center';

/** Puntos de pantalla a consultar: un 8 % hacia dentro de cada borde para no caer en el fondo. */
export function probePoints(b: ScreenBox, inset = 0.08): Record<BoxProbe, { x: number; y: number }> {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const ix = b.width * inset, iy = b.height * inset;
  return {
    left: { x: b.x + ix, y: cy },
    right: { x: b.x + b.width - ix, y: cy },
    top: { x: cx, y: b.y + iy },
    bottom: { x: cx, y: b.y + b.height - iy },
    center: { x: cx, y: cy },
  };
}

export interface BoxMeasure { widthM: number | null; heightM: number | null; distanceM: number | null }

/**
 * Ancho = izquierda↔derecha, alto = arriba↔abajo, corregidos por el margen interior (÷ (1 − 2·inset)).
 * Si los dos puntos de un par están a profundidades muy distintas (uno cayó en el fondo), esa medida se descarta.
 */
export function measureFromProbes(
  hits: Partial<Record<BoxProbe, Point3>>, camera: Point3 | null, inset = 0.08, maxDepthJumpM = 0.6,
): BoxMeasure {
  const k = 1 / (1 - 2 * inset);
  const depth = (p: Point3) => (camera ? distance3(p, camera) : 0);
  const pair = (a?: Point3, b?: Point3) => {
    if (!a || !b) return null;
    if (camera && Math.abs(depth(a) - depth(b)) > maxDepthJumpM) return null;
    const d = distance3(a, b) * k;
    return d >= 0.02 ? d : null;
  };
  return {
    widthM: pair(hits.left, hits.right),
    heightM: pair(hits.top, hits.bottom),
    distanceM: hits.center && camera ? depth(hits.center) : null,
  };
}

/** Elige la escala de coordenadas (dp o px) cuyo punto central coincide mejor con la retícula. */
export function pickScale(candidates: { scale: number; hit: Point3 | null }[], reticle: Point3): number | null {
  let best: { scale: number; d: number } | null = null;
  for (const c of candidates) {
    if (!c.hit) continue;
    const d = distance3(c.hit, reticle);
    if (!best || d < best.d) best = { scale: c.scale, d };
  }
  return best && best.d < 0.15 ? best.scale : null;
}

// ───────────────────────── Método preciso (malla + mediana) ─────────────────────────

export interface GridSample { sx: number; sy: number; p: Point3 } // punto de pantalla (dp) y su punto 3D
export interface GridMeasure extends BoxMeasure { inliers: number; spread: number }

export function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  return n === 0 ? NaN : n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/** Malla n×n de puntos de pantalla dentro del recuadro (zona central: del 15 % al 85 %). */
export function gridPoints(b: ScreenBox, n = 4, margin = 0.15): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = margin + ((1 - 2 * margin) * i) / (n - 1), v = margin + ((1 - 2 * margin) * j) / (n - 1);
      pts.push({ x: b.x + b.width * u, y: b.y + b.height * v });
    }
  }
  return pts;
}

/**
 * Tamaño real del objeto a partir de puntos 3D dentro de su recuadro:
 * 1. Se descartan los puntos que no están a la profundidad del objeto (fondo, piso).
 * 2. Con cada par de puntos restantes se calcula cuántos metros mide un dp de pantalla a esa
 *    profundidad (solo la componente perpendicular a la vista), y se toma la mediana.
 * 3. Ancho y alto = metros/dp × tamaño del recuadro en dp.
 * No depende de la focal ni de la escala de pantalla: se calibra sola con los propios puntos.
 * `spread` (0 = perfecto) mide la dispersión de la escala; sirve para la confiabilidad.
 */
export function measureFromGrid(samples: GridSample[], box: ScreenBox, camera: Point3, depthTol = 0.25): GridMeasure | null {
  if (samples.length < 4) return null;
  const depth = (p: Point3) => distance3(p, camera);
  const dm = median(samples.map((s) => depth(s.p)));
  const inl = samples.filter((s) => Math.abs(depth(s.p) - dm) <= Math.max(0.12, depthTol * dm));
  if (inl.length < 4) return null;
  const c = inl.reduce((a, s) => ({ x: a.x + s.p.x / inl.length, y: a.y + s.p.y / inl.length, z: a.z + s.p.z / inl.length }), { x: 0, y: 0, z: 0 });
  const vl = distance3(c, camera) || 1;
  const v = { x: (c.x - camera.x) / vl, y: (c.y - camera.y) / vl, z: (c.z - camera.z) / vl };
  const minSep = 0.2 * Math.min(box.width, box.height);
  const ratios: number[] = [];
  for (let i = 0; i < inl.length; i++) {
    for (let j = i + 1; j < inl.length; j++) {
      const ds = Math.hypot(inl[i].sx - inl[j].sx, inl[i].sy - inl[j].sy);
      if (ds < minSep) continue;
      const d = { x: inl[i].p.x - inl[j].p.x, y: inl[i].p.y - inl[j].p.y, z: inl[i].p.z - inl[j].p.z };
      const along = d.x * v.x + d.y * v.y + d.z * v.z;
      const perp = Math.sqrt(Math.max(0, d.x * d.x + d.y * d.y + d.z * d.z - along * along));
      ratios.push(perp / ds);
    }
  }
  if (ratios.length < 3) return null;
  const r = median(ratios);
  if (!(r > 0)) return null;
  const spread = median(ratios.map((x) => Math.abs(x - r))) / r;
  return { widthM: r * box.width, heightM: r * box.height, distanceM: dm, inliers: inl.length, spread };
}

/** Mediana temporal de las últimas lecturas (quita saltos entre cuadros). */
export function smoothMeasures(history: GridMeasure[]): GridMeasure | null {
  if (!history.length) return null;
  const med = (f: (m: GridMeasure) => number | null) => {
    const xs = history.map(f).filter((x): x is number => x != null);
    return xs.length ? median(xs) : null;
  };
  return {
    widthM: med((m) => m.widthM), heightM: med((m) => m.heightM), distanceM: med((m) => m.distanceM),
    inliers: Math.round(median(history.map((m) => m.inliers))), spread: median(history.map((m) => m.spread)),
  };
}
