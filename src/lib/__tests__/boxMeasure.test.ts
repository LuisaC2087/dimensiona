import { measureFromProbes, pickScale, probePoints } from '../boxMeasure';
import { labelEs } from '../objectLabels';

describe('CR-04 medida por recuadro', () => {
  test('puntos de consulta dentro del recuadro', () => {
    const p = probePoints({ x: 100, y: 200, width: 200, height: 100 });
    expect(p.left).toEqual({ x: 116, y: 250 });
    expect(p.bottom).toEqual({ x: 200, y: 292 });
  });

  test('ancho y alto corregidos por el margen interior', () => {
    const cam = { x: 0, y: 0, z: 0 };
    // Objeto de 1,0 × 0,5 m a 2 m: con margen 8 % los puntos quedan al 84 %.
    const m = measureFromProbes({
      left: { x: -0.42, y: 0, z: -2 }, right: { x: 0.42, y: 0, z: -2 },
      top: { x: 0, y: 0.21, z: -2 }, bottom: { x: 0, y: -0.21, z: -2 }, center: { x: 0, y: 0, z: -2 },
    }, cam);
    expect(m.widthM).toBeCloseTo(1.0, 6);
    expect(m.heightM).toBeCloseTo(0.5, 6);
    expect(m.distanceM).toBeCloseTo(2, 6);
  });

  test('descarta un par si un punto cayó en el fondo', () => {
    const cam = { x: 0, y: 0, z: 0 };
    const m = measureFromProbes({ left: { x: -0.4, y: 0, z: -2 }, right: { x: 0.9, y: 0, z: -4 } }, cam);
    expect(m.widthM).toBeNull();
  });

  test('calibración dp/px', () => {
    const ret = { x: 0, y: 0, z: -2 };
    expect(pickScale([{ scale: 1, hit: { x: 0.9, y: 0.5, z: -2 } }, { scale: 2.75, hit: { x: 0.01, y: 0, z: -2 } }], ret)).toBe(2.75);
    expect(pickScale([{ scale: 1, hit: null }], ret)).toBeNull();
  });

  test('etiquetas en español', () => {
    expect(labelEs('Dining Table')).toBe('Mesa de comedor');
    expect(labelEs('gizmo')).toBe('Gizmo');
  });
});

describe('CR-05 medida precisa por malla', () => {
  const { gridPoints, measureFromGrid, median, smoothMeasures } = require('../boxMeasure');
  const cam = { x: 0, y: 0, z: 0 };
  const f = 500, cx = 200, cy = 400; // cámara estenopeica simulada (dp)
  const box = { x: 100, y: 350, width: 200, height: 100 };
  const at = (sx: number, sy: number, z: number) => ({ sx, sy, p: { x: ((sx - cx) * z) / f, y: (-(sy - cy) * z) / f, z: -z } });

  test('mediana', () => { expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 4])).toBe(2.5); });

  test('objeto plano a 2 m: 0,80 × 0,40 m (error ≤ 0,01 %)', () => {
    const s = gridPoints(box).map((p: { x: number; y: number }) => at(p.x, p.y, 2));
    const m = measureFromGrid(s, box, cam)!;
    expect(Math.abs(m.widthM! - 0.8) / 0.8).toBeLessThan(1e-4);
    expect(Math.abs(m.heightM! - 0.4) / 0.4).toBeLessThan(1e-4);
    expect(m.spread).toBeLessThan(1e-6);
  });

  test('ignora puntos que cayeron en el fondo (a 4 m)', () => {
    const pts = gridPoints(box);
    const s = pts.map((p: { x: number; y: number }, i: number) => at(p.x, p.y, i % 4 === 0 ? 4 : 2));
    const m = measureFromGrid(s, box, cam)!;
    expect(m.inliers).toBe(12);
    expect(m.widthM!).toBeCloseTo(0.8, 2);
  });

  test('sin suficientes puntos no inventa una medida', () => {
    expect(measureFromGrid([at(150, 380, 2), at(250, 420, 2)], box, cam)).toBeNull();
  });

  test('la mediana temporal quita un salto', () => {
    const mk = (w: number) => ({ widthM: w, heightM: 0.4, distanceM: 2, inliers: 16, spread: 0 });
    expect(smoothMeasures([mk(0.8), mk(0.81), mk(1.6), mk(0.79), mk(0.8)])!.widthM).toBe(0.8);
  });
});
