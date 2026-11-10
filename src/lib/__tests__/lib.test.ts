import {
  calibrationFactor, computeReliability, combineReliability, distance3, distanceFactor,
  formatLength, fromMeters, isFactorAcceptable, parseDecimal, polygonArea, perimeter,
  roomMetrics, toFeet, uncertainty, validateContour, heightBetween, type Point2,
} from '..';

const rel = (a: number, b: number) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));
const close = (a: number, b: number) => expect(rel(a, b)).toBeLessThanOrEqual(1e-4); // PR-04: 0,01 %

const rect = (w: number, d: number): Point2[] => [
  { x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d },
];

describe('PR-04 geometría (≥ 10 casos conocidos)', () => {
  test('1. rectángulo de verificación 4,20 × 3,60 × 2,50 (Apéndice D)', () => {
    const m = roomMetrics(rect(4.2, 3.6), 2.5);
    close(m.floorArea, 15.12);
    close(m.perimeter, 15.6);
    close(m.volume!, 37.8);
    close(m.wallArea!, 39.0);
  });
  test('2. cuadrado 3 × 3', () => { close(polygonArea(rect(3, 3)), 9); close(perimeter(rect(3, 3)), 12); });
  test('3. forma en L', () => {
    const L: Point2[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }];
    close(polygonArea(L), 12); close(perimeter(L), 16);
  });
  test('4. trapecio', () => {
    const t: Point2[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 4, z: 3 }, { x: 1, z: 3 }];
    close(polygonArea(t), 13.5);
    close(perimeter(t), 6 + Math.hypot(2, 3) + 3 + Math.hypot(1, 3));
  });
  test('5. triángulo 3-4-5', () => {
    const t: Point2[] = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 4 }];
    close(polygonArea(t), 6); close(perimeter(t), 12);
  });
  test('6. orientación horaria da la misma área', () => close(polygonArea(rect(4.2, 3.6).reverse()), 15.12));
  test('7. rectángulo trasladado (coordenadas negativas)', () => {
    const r = rect(2.5, 3.1).map((p) => ({ x: p.x - 7.3, z: p.z - 1.2 }));
    close(polygonArea(r), 7.75);
  });
  test('8. hexágono regular de lado 1', () => {
    const h = Array.from({ length: 6 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 3), z: Math.sin((i * Math.PI) / 3) }));
    close(polygonArea(h), (3 * Math.sqrt(3)) / 2); close(perimeter(h), 6);
  });
  test('9. dodecágono (12 vértices, máximo)', () => {
    const n = 12;
    const d = Array.from({ length: n }, (_, i) => ({ x: 2 * Math.cos((2 * Math.PI * i) / n), z: 2 * Math.sin((2 * Math.PI * i) / n) }));
    close(polygonArea(d), 0.5 * n * 4 * Math.sin((2 * Math.PI) / n));
  });
  test('10. calibración k = 1,05 escala k, k², k³', () => {
    const m = roomMetrics(rect(4, 3), 2.5, 1.05);
    close(m.perimeter, 14 * 1.05); close(m.floorArea, 12 * 1.05 ** 2); close(m.volume!, 30 * 1.05 ** 3);
  });
  test('11. sin altura: solo lo calculable', () => {
    const m = roomMetrics(rect(4, 3), null);
    expect(m.volume).toBeNull(); expect(m.wallArea).toBeNull(); close(m.floorArea, 12);
  });
  test('distancia 3D y altura', () => {
    close(distance3({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 }), 3);
    close(heightBetween({ x: 0, y: -1.2, z: 0 }, { x: 0.1, y: 1.3, z: 0 }), 2.5);
  });
});

describe('RF-05 validación de contorno', () => {
  test('menos de 3 esquinas', () => expect(validateContour(rect(1, 1).slice(0, 2))[0].kind).toBe('tooFewCorners'));
  test('rectángulo válido', () => expect(validateContour(rect(4, 3))).toEqual([]));
  test('lado < 0,30 m', () => expect(validateContour(rect(4, 0.2)).some((e) => e.kind === 'shortWall')).toBe(true));
  test('lados que se cruzan (moño)', () => {
    const bow: Point2[] = [{ x: 0, z: 0 }, { x: 3, z: 3 }, { x: 3, z: 0 }, { x: 0, z: 3 }];
    expect(validateContour(bow)).toContainEqual({ kind: 'crossingWalls', walls: [0, 2] });
  });
});

describe('RF-09 confiabilidad', () => {
  test('condiciones ideales = 100, Alta', () => {
    const r = computeReliability({ tracking: 'good', surface: 'plane', cameraDistanceM: 1 });
    expect(r.score).toBeCloseTo(100); expect(r.level).toBe('Alta'); expect(r.partial).toBe(false);
  });
  test('limitado + puntos de características a 5 m', () => {
    const r = computeReliability({ tracking: 'limited', surface: 'featurePoint', cameraDistanceM: 5 });
    expect(r.score).toBeCloseTo(100 * (0.4 * 0.5 + 0.3 * 0.5 + 0.3 * 0.3)); expect(r.level).toBe('Baja');
  });
  test('factor D lineal y límites', () => {
    expect(distanceFactor(2)).toBe(1); expect(distanceFactor(3.5)).toBeCloseTo(0.65);
    expect(distanceFactor(5)).toBeCloseTo(0.3); expect(distanceFactor(6)).toBe(0.2);
  });
  test('renormaliza si falta un factor y marca parcial', () => {
    const r = computeReliability({ tracking: 'good', surface: 'featurePoint' });
    expect(r.score).toBeCloseTo((100 * (0.4 + 0.15)) / 0.7); expect(r.partial).toBe(true);
  });
  test('derivadas usan la menor', () => {
    const a = computeReliability({ tracking: 'good', surface: 'plane', cameraDistanceM: 1 });
    const b = computeReliability({ tracking: 'limited', surface: 'plane', cameraDistanceM: 1 });
    expect(combineReliability([a, b])).toBe(b); expect(b.level).toBe('Alta');
  });
  test('RF-13 incertidumbre 2,48 m Media ≈ ±0,15', () => expect(uncertainty(2.48, 'Media')).toBeCloseTo(0.1488));
});

describe('RF-12 calibración', () => {
  test('k y rango', () => {
    close(calibrationFactor(1, 0.96), 1 / 0.96);
    expect(isFactorAcceptable(1.1)).toBe(true); expect(isFactorAcceptable(1.2)).toBe(false);
    expect(() => calibrationFactor(1, 0)).toThrow();
  });
});

describe('RF-15 unidades', () => {
  test('1 m = 100 cm = 39,37 in = 3,281 ft (error ≤ 0,01)', () => {
    expect(Math.abs(fromMeters(1, 'cm') - 100)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(fromMeters(1, 'in') - 39.37)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(toFeet(1) - 3.281)).toBeLessThanOrEqual(0.01);
  });
  test('formato es-CO', () => {
    expect(formatLength(2.48, 'm')).toBe('2,48 m');
    expect(formatLength(2.48, 'cm')).toBe('248 cm');
    expect(formatLength(1, 'ft-in')).toBe('3 ft 3 in');
  });
  test('entrada manual', () => {
    expect(parseDecimal('2,45')).toBe(2.45); expect(parseDecimal('abc')).toBeNull();
  });
});
