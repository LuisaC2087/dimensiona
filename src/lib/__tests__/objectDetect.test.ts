import { detectObject, floorLevel, minAreaRect } from '../objectDetect';

describe('Medición de objetos', () => {
  test('rectángulo mínimo de un contorno rotado 30°', () => {
    const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
    const rect = [[0, 0], [1.2, 0], [1.2, 0.6], [0, 0.6]].map(([x, z]) => ({ x: x * c - z * s, z: x * s + z * c }));
    const r = minAreaRect(rect);
    expect(r.lengthM).toBeCloseTo(1.2, 6);
    expect(r.widthM).toBeCloseTo(0.6, 6);
    expect(r.corners).toHaveLength(4);
    for (const c of r.corners) expect(rect.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 1e-6)).toBe(true);
  });

  const floor = { id: 'f', y: -1.4, cx: 0, cz: 0, widthM: 3, lengthM: 4 };
  const table = { id: 't', y: -0.65, cx: 1, cz: 0.5, widthM: 0.8, lengthM: 1.5 };

  test('detecta la mesa bajo la retícula con su altura', () => {
    expect(floorLevel([floor, table])).toBe(-1.4);
    const d = detectObject([floor, table], { x: 1.1, y: -0.64, z: 0.4 })!;
    expect(d.planeId).toBe('t');
    expect(d.lengthM).toBe(1.5);
    expect(d.heightM).toBeCloseTo(0.75, 6);
  });

  test('apuntar al piso no es un objeto', () => {
    expect(detectObject([floor, table], { x: -1, y: -1.4, z: -1 })).toBeNull();
  });

  test('sin piso detectado: medidas sin altura', () => {
    const d = detectObject([table], { x: 1, y: -0.65, z: 0.5 })!;
    expect(d.heightM).toBeNull();
  });
});

test('planeUnder: el piso también cuenta como superficie', () => {
  const { planeUnder } = require('../objectDetect');
  const floor = { id: 'f', y: -1.4, cx: 0, cz: 0, widthM: 3, lengthM: 4 };
  expect(planeUnder([floor], { x: 0.5, y: -1.39, z: 0.2 })?.id).toBe('f');
  expect(planeUnder([floor], { x: 0.5, y: -0.5, z: 0.2 })).toBeNull();
});
