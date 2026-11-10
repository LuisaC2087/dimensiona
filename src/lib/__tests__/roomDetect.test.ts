import { estimateRoom, fitLine, intersect, ransacLines, polygonFromLines } from '../roomDetect';
import { polygonArea, perimeter } from '../geometry';
import type { Point2, Point3 } from '../types';

/** Generador determinista para ruido */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Simula el recorrido: muestras sobre cada pared, a varias alturas, con ruido gaussiano aproximado. */
function sampleWalls(corners: Point2[], opts: { perWall?: number; noise?: number; floorY?: number; height?: number; seed?: number } = {}): Point3[] {
  const { perWall = 80, noise = 0.01, floorY = -1.4, height = 2.5, seed = 3 } = opts;
  const r = rng(seed);
  const n = () => (r() + r() + r() - 1.5) * noise * 2;
  const out: Point3[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length];
    for (let k = 0; k < perWall; k++) {
      const t = 0.05 + 0.9 * r();
      out.push({ x: a.x + (b.x - a.x) * t + n(), y: floorY + 0.1 + r() * (height - 0.2), z: a.z + (b.z - a.z) * t + n() });
    }
  });
  // ruido: puntos del piso y de muebles en el centro
  for (let k = 0; k < 40; k++) out.push({ x: r() * 2, y: floorY + r() * 0.3, z: r() * 2 });
  return out;
}

const near = (a: Point2, b: Point2, tol: number) => Math.hypot(a.x - b.x, a.z - b.z) <= tol;
function matchCorners(found: Point2[], expected: Point2[], tol: number) {
  expect(found).toHaveLength(expected.length);
  for (const e of expected) expect(found.some((f) => near(f, e, tol))).toBe(true);
}

describe('CR-02 detección automática de la habitación', () => {
  test('recta por PCA', () => {
    const l = fitLine([{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 }]);
    expect(Math.abs(l.dir.z)).toBeLessThan(1e-9);
  });

  test('intersección de rectas y paralelas', () => {
    expect(intersect({ point: { x: 0, z: 0 }, dir: { x: 1, z: 0 } }, { point: { x: 2, z: 5 }, dir: { x: 0, z: 1 } })).toEqual({ x: 2, z: 0 });
    expect(intersect({ point: { x: 0, z: 0 }, dir: { x: 1, z: 0 } }, { point: { x: 0, z: 1 }, dir: { x: 1, z: 0 } })).toBeNull();
  });

  test('sala 4,20 × 3,60 con ruido de 1 cm: esquinas a ≤ 3 cm, área y perímetro ≤ 2 %', () => {
    const real: Point2[] = [{ x: 0, z: 0 }, { x: 4.2, z: 0 }, { x: 4.2, z: 3.6 }, { x: 0, z: 3.6 }];
    const est = estimateRoom(sampleWalls(real), -1.4, 1.1);
    expect(est.walls).toBe(4);
    matchCorners(est.corners!, real, 0.03);
    expect(Math.abs(polygonArea(est.corners!) - 15.12) / 15.12).toBeLessThan(0.02);
    expect(Math.abs(perimeter(est.corners!) - 15.6) / 15.6).toBeLessThan(0.02);
    expect(est.heightM).toBeCloseTo(2.5);
    expect(est.fit).toBeGreaterThan(0.9);
  });

  test('habitación girada 30° y desplazada', () => {
    const a = Math.PI / 6;
    const rot = (p: Point2) => ({ x: 5 + p.x * Math.cos(a) - p.z * Math.sin(a), z: -2 + p.x * Math.sin(a) + p.z * Math.cos(a) });
    const real = [{ x: 0, z: 0 }, { x: 3.1, z: 0 }, { x: 3.1, z: 2.8 }, { x: 0, z: 2.8 }].map(rot);
    const est = estimateRoom(sampleWalls(real, { seed: 11 }), -1.4, null);
    matchCorners(est.corners!, real, 0.03);
    expect(est.heightM).toBeNull();
  });

  test('trapecio (5 paredes, convexo)', () => {
    const real: Point2[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 5, z: 2 }, { x: 3, z: 4 }, { x: 0, z: 3 }];
    const est = estimateRoom(sampleWalls(real, { seed: 5 }), -1.4, 1.1);
    expect(est.walls).toBe(5);
    matchCorners(est.corners!, real, 0.04);
  });

  test('una pared detectada dos veces se fusiona', () => {
    const pts: Point2[] = [];
    for (let i = 0; i < 40; i++) pts.push({ x: i * 0.05, z: 0.0 }, { x: i * 0.05, z: 0.02 });
    expect(ransacLines(pts)).toHaveLength(1);
  });

  test('con menos de 3 paredes no hay contorno', () => {
    const real: Point2[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
    const samples = sampleWalls(real).filter((p) => p.z < 0.5 && p.y > -1); // solo una pared
    const est = estimateRoom(samples, -1.4, 1.1);
    expect(est.corners).toBeNull();
    expect(polygonFromLines([])).toBeNull();
  });
});
