/**
 * CR-02 (RF-05/RF-06 automáticos): reconstrucción de la habitación a partir de muestras 3D.
 *
 * Entrada: puntos del mundo obtenidos de la retícula mientras la persona recorre las paredes,
 * la altura del piso (plano horizontal hacia arriba) y, si existe, la del techo.
 * 1) Se filtran los puntos de pared (franja de altura entre piso y techo) y se proyectan a (x, z).
 * 2) RANSAC secuencial encuentra las rectas (paredes); se fusionan las casi colineales.
 * 3) Se ordenan alrededor del centroide y cada esquina es la intersección de paredes consecutivas.
 * Válido para habitaciones convexas (rectangulares, trapecios…); las no convexas usan el respaldo manual.
 */
import type { Point2, Point3 } from './types';

export interface Line2 { point: Point2; dir: Point2; inliers: Point2[] }

export interface RoomDetectConfig {
  tolM: number; // distancia máxima de un punto a su pared
  minInliers: number; // puntos mínimos para aceptar una pared
  maxWalls: number;
  iterations: number;
  mergeAngleDeg: number;
  mergeDistM: number;
  bandBottomM: number; // ignora puntos hasta esta altura sobre el piso (zócalos, muebles bajos)
  bandTopM: number; // ignora puntos a menos de esto del techo
}

export const ROOM_DETECT_CONFIG: RoomDetectConfig = {
  tolM: 0.04,
  minInliers: 20,
  maxWalls: 12,
  iterations: 300,
  mergeAngleDeg: 10,
  mergeDistM: 0.12,
  bandBottomM: 0.35,
  bandTopM: 0.25,
};

/** Generador pseudoaleatorio determinista (pruebas reproducibles). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const sub = (a: Point2, b: Point2): Point2 => ({ x: a.x - b.x, z: a.z - b.z });
const dot = (a: Point2, b: Point2) => a.x * b.x + a.z * b.z;
const norm = (a: Point2) => Math.hypot(a.x, a.z);

export function distToLine(p: Point2, l: { point: Point2; dir: Point2 }): number {
  const d = sub(p, l.point);
  return Math.abs(d.x * l.dir.z - d.z * l.dir.x);
}

/** Recta por mínimos cuadrados totales (PCA). */
export function fitLine(points: Point2[]): { point: Point2; dir: Point2 } {
  const n = points.length;
  const c = { x: points.reduce((s, p) => s + p.x, 0) / n, z: points.reduce((s, p) => s + p.z, 0) / n };
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of points) {
    const dx = p.x - c.x, dz = p.z - c.z;
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  return { point: c, dir: { x: Math.cos(theta), z: Math.sin(theta) } };
}

export function ransacLines(points: Point2[], cfg: RoomDetectConfig = ROOM_DETECT_CONFIG, seed = 7): Line2[] {
  const rand = rng(seed);
  let remaining = points.slice();
  const lines: Line2[] = [];
  while (remaining.length >= cfg.minInliers && lines.length < cfg.maxWalls) {
    let best: Point2[] = [];
    for (let it = 0; it < cfg.iterations; it++) {
      const a = remaining[Math.floor(rand() * remaining.length)];
      const b = remaining[Math.floor(rand() * remaining.length)];
      const d = sub(b, a);
      const len = norm(d);
      if (len < 0.2) continue;
      const l = { point: a, dir: { x: d.x / len, z: d.z / len } };
      const inl = remaining.filter((p) => distToLine(p, l) <= cfg.tolM);
      if (inl.length > best.length) best = inl;
    }
    if (best.length < cfg.minInliers) break;
    const fitted = fitLine(best);
    const inliers = remaining.filter((p) => distToLine(p, fitted) <= cfg.tolM);
    if (inliers.length < cfg.minInliers) break;
    lines.push({ ...fitLine(inliers), inliers });
    const set = new Set(inliers);
    remaining = remaining.filter((p) => !set.has(p));
  }
  return mergeLines(lines, cfg);
}

function angleBetween(a: Point2, b: Point2): number {
  return (Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI;
}

/** Une rectas casi paralelas y cercanas (misma pared detectada dos veces). */
export function mergeLines(lines: Line2[], cfg: RoomDetectConfig = ROOM_DETECT_CONFIG): Line2[] {
  const out: Line2[] = [];
  for (const l of [...lines].sort((a, b) => b.inliers.length - a.inliers.length)) {
    const twin = out.find((o) => angleBetween(o.dir, l.dir) < cfg.mergeAngleDeg && distToLine(l.point, o) < cfg.mergeDistM);
    if (twin) {
      const pts = [...twin.inliers, ...l.inliers];
      Object.assign(twin, fitLine(pts), { inliers: pts });
    } else out.push({ ...l });
  }
  return out;
}

export function intersect(a: { point: Point2; dir: Point2 }, b: { point: Point2; dir: Point2 }): Point2 | null {
  const det = a.dir.x * b.dir.z - a.dir.z * b.dir.x;
  if (Math.abs(det) < 1e-6) return null;
  const d = sub(b.point, a.point);
  const t = (d.x * b.dir.z - d.z * b.dir.x) / det;
  return { x: a.point.x + t * a.dir.x, z: a.point.z + t * a.dir.z };
}

/** Ordena las paredes alrededor del centroide y obtiene las esquinas como intersecciones consecutivas. */
export function polygonFromLines(lines: Line2[]): Point2[] | null {
  if (lines.length < 3) return null;
  const all = lines.flatMap((l) => l.inliers);
  const c = { x: all.reduce((s, p) => s + p.x, 0) / all.length, z: all.reduce((s, p) => s + p.z, 0) / all.length };
  const mids = lines.map((l) => {
    const m = { x: l.inliers.reduce((s, p) => s + p.x, 0) / l.inliers.length, z: l.inliers.reduce((s, p) => s + p.z, 0) / l.inliers.length };
    return { l, ang: Math.atan2(m.z - c.z, m.x - c.x) };
  });
  mids.sort((a, b) => a.ang - b.ang);
  const corners: Point2[] = [];
  for (let i = 0; i < mids.length; i++) {
    const p = intersect(mids[i].l, mids[(i + 1) % mids.length].l);
    if (!p) return null;
    corners.push(p);
  }
  return corners;
}

export interface RoomEstimate {
  corners: Point2[] | null;
  walls: number;
  wallSamples: number;
  heightM: number | null;
  /** Muestras de pared que quedaron explicadas por alguna pared (0..1). Indicador de calidad. */
  fit: number;
}

export function estimateRoom(samples: Point3[], floorY: number, ceilingY: number | null, cfg: RoomDetectConfig = ROOM_DETECT_CONFIG): RoomEstimate {
  const top = ceilingY != null ? ceilingY - cfg.bandTopM : floorY + 2.2;
  const wallPts = samples
    .filter((p) => p.y > floorY + cfg.bandBottomM && p.y < top)
    .map((p) => ({ x: p.x, z: p.z }));
  const lines = ransacLines(wallPts, cfg);
  const explained = lines.reduce((s, l) => s + l.inliers.length, 0);
  return {
    corners: polygonFromLines(lines),
    walls: lines.length,
    wallSamples: wallPts.length,
    heightM: ceilingY != null ? ceilingY - floorY : null,
    fit: wallPts.length ? explained / wallPts.length : 0,
  };
}

/** Descarta muestras repetidas en una rejilla de `cellM` (el muestreo es por fotograma). */
export function voxelKey(p: Point3, cellM = 0.03): string {
  return `${Math.round(p.x / cellM)},${Math.round(p.y / cellM)},${Math.round(p.z / cellM)}`;
}
