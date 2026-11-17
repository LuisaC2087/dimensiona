/**
 * Medición rápida de objetos (RF-03 ampliado): ARCore detecta la cara superior de un objeto
 * (mesa, caja, mueble) como un plano horizontal. Con su contorno se estiman largo y ancho, y con
 * el plano del piso, la altura. Funciones puras.
 */
import type { Point2, Point3 } from './types';

export interface HPlane { id: string; y: number; cx: number; cz: number; widthM: number; lengthM: number }
export interface ObjectDims { planeId: string; lengthM: number; widthM: number; heightM: number | null }

export const OBJECT_CONFIG = {
  minAboveFloorM: 0.05, // la cara superior debe estar al menos 5 cm sobre el piso
  hitToleranceM: 0.06, // la retícula debe caer sobre el plano (vertical)
  edgeMarginM: 0.05,
  minSideM: 0.05,
  maxObjectM: 2.5, // un plano solitario más grande que esto se toma como piso
};

/** Rectángulo de área mínima que contiene los puntos (independiente de la rotación). Devuelve lados ordenados (largo ≥ ancho). */
export function minAreaRect(pts: Point2[]): { lengthM: number; widthM: number; corners: Point2[] } {
  if (pts.length < 2) return { lengthM: 0, widthM: 0, corners: [] };
  let best = { area: Infinity, a: 0, b: 0, corners: [] as Point2[] };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const ang = Math.atan2(q.z - p.z, q.x - p.x);
    const c = Math.cos(ang), s = Math.sin(ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const r of pts) {
      const u = r.x * c + r.z * s, v = -r.x * s + r.z * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const a = maxU - minU, b = maxV - minV;
    if (a * b < best.area) {
      const back = (u: number, v: number): Point2 => ({ x: u * c - v * s, z: u * s + v * c });
      best = { area: a * b, a, b, corners: [back(minU, minV), back(maxU, minV), back(maxU, maxV), back(minU, maxV)] };
    }
  }
  return { lengthM: Math.max(best.a, best.b), widthM: Math.min(best.a, best.b), corners: best.corners };
}

/** Piso = el plano horizontal más bajo (null si no hay). */
export function floorLevel(planes: HPlane[]): number | null {
  return planes.length ? Math.min(...planes.map((p) => p.y)) : null;
}

/** Busca el plano horizontal (sobre el piso) bajo la retícula y devuelve las medidas del objeto. */
export function detectObject(planes: HPlane[], hit: Point3, cfg = OBJECT_CONFIG): ObjectDims | null {
  const floorY = floorLevel(planes);
  let best: HPlane | null = null;
  for (const p of planes) {
    // Plano al nivel del piso: es el piso, salvo que sea el único plano y tenga tamaño de objeto
    const atFloor = floorY != null && p.y - floorY < cfg.minAboveFloorM;
    if (atFloor && (planes.length > 1 || p.lengthM > cfg.maxObjectM)) continue;
    if (Math.abs(hit.y - p.y) > cfg.hitToleranceM) continue;
    const r = Math.hypot(p.lengthM, p.widthM) / 2 + cfg.edgeMarginM;
    if (Math.hypot(hit.x - p.cx, hit.z - p.cz) > r) continue;
    if (p.widthM < cfg.minSideM) continue;
    if (!best || p.lengthM * p.widthM < best.lengthM * best.widthM) best = p; // el más pequeño que contiene la retícula
  }
  if (!best) return null;
  return {
    planeId: best.id,
    lengthM: best.lengthM,
    widthM: best.widthM,
    heightM: floorY != null && best.y - floorY >= cfg.minAboveFloorM ? best.y - floorY : null,
  };
}

/** Plano horizontal bajo la retícula (incluye el piso); el más pequeño que la contiene. */
export function planeUnder(planes: HPlane[], hit: Point3, cfg = OBJECT_CONFIG): HPlane | null {
  let best: HPlane | null = null;
  for (const p of planes) {
    if (Math.abs(hit.y - p.y) > cfg.hitToleranceM) continue;
    if (Math.hypot(hit.x - p.cx, hit.z - p.cz) > Math.hypot(p.lengthM, p.widthM) / 2 + cfg.edgeMarginM) continue;
    if (!best || p.lengthM * p.widthM < best.lengthM * best.widthM) best = p;
  }
  return best;
}
