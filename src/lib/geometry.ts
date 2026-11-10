import type { Point2, Point3 } from './types';

export const MIN_POINT_SEPARATION_M = 0.01; // RF-04
export const MIN_WALL_LENGTH_M = 0.3; // RF-05
export const MIN_CORNERS = 3;
export const MAX_CORNERS = 12;
export const HEIGHT_MIN_M = 1.8; // RF-06
export const HEIGHT_MAX_M = 6.0;

export function distance3(a: Point3, b: Point3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function distance2(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Proyecta un punto 3D al plano horizontal (RF-05). */
export function toFloor(p: Point3): Point2 {
  return { x: p.x, z: p.z };
}

export function wallLengths(poly: Point2[]): number[] {
  return poly.map((p, i) => distance2(p, poly[(i + 1) % poly.length]));
}

export function perimeter(poly: Point2[]): number {
  return wallLengths(poly).reduce((s, l) => s + l, 0);
}

/** Fórmula del polígono (shoelace), Apéndice D. */
export function polygonArea(poly: Point2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s) / 2;
}

/** Altura piso-techo con el eje Y alineado a la gravedad (RF-06). */
export function heightBetween(floor: Point3, ceiling: Point3): number {
  return Math.abs(ceiling.y - floor.y);
}

export function isHeightInRange(h: number): boolean {
  return h >= HEIGHT_MIN_M && h <= HEIGHT_MAX_M;
}

function orient(a: Point2, b: Point2, c: Point2): number {
  const v = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return Math.abs(v) < 1e-12 ? 0 : Math.sign(v);
}

function onSegment(a: Point2, b: Point2, p: Point2): boolean {
  return (
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.z, b.z) <= p.z && p.z <= Math.max(a.z, b.z)
  );
}

export function segmentsIntersect(p1: Point2, p2: Point2, q1: Point2, q2: Point2): boolean {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

export type ContourError =
  | { kind: 'tooFewCorners' }
  | { kind: 'tooManyCorners' }
  | { kind: 'shortWall'; wall: number; length: number }
  | { kind: 'crossingWalls'; walls: [number, number] };

/** Valida el contorno al cerrarlo (RF-05). La pared i une la esquina i con la i+1. */
export function validateContour(poly: Point2[]): ContourError[] {
  if (poly.length < MIN_CORNERS) return [{ kind: 'tooFewCorners' }];
  if (poly.length > MAX_CORNERS) return [{ kind: 'tooManyCorners' }];
  const errors: ContourError[] = [];
  wallLengths(poly).forEach((length, wall) => {
    if (length < MIN_WALL_LENGTH_M) errors.push({ kind: 'shortWall', wall, length });
  });
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) {
        errors.push({ kind: 'crossingWalls', walls: [i, j] });
      }
    }
  }
  return errors;
}

export interface RoomMetrics {
  walls: number[];
  perimeter: number;
  floorArea: number;
  wallArea: number | null;
  volume: number | null;
}

/** RF-07: magnitudes con factor de calibración k (longitudes·k, áreas·k², volumen·k³). */
export function roomMetrics(poly: Point2[], height: number | null, k = 1): RoomMetrics {
  const walls = wallLengths(poly).map((l) => l * k);
  const p = walls.reduce((s, l) => s + l, 0);
  const a = polygonArea(poly) * k * k;
  const h = height == null ? null : height * k;
  return {
    walls,
    perimeter: p,
    floorArea: a,
    wallArea: h == null ? null : p * h,
    volume: h == null ? null : a * h,
  };
}
