import {
  distance3, distanceStatus, heightAboveSupport, MAX_DISTANCE_M, MIN_DISTANCE_M, iso, maxRelativeDiff, median, minAreaRect, normalizeDims, photoMeasureCm, reliability, reliabilityLabel, toCm,
} from '../measure';
import { cm, dims, eta, money, waNumber } from '../format';

describe('geometría', () => {
  it('distance3', () => {
    expect(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBeCloseTo(13, 10);
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
  it('minAreaRect de un rectángulo rotado 30°', () => {
    const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
    const rect = [[0, 0], [0.4, 0], [0.4, 0.2], [0, 0.2]].map(([x, z]) => ({ x: x * c - z * s, z: x * s + z * c }));
    const r = minAreaRect(rect);
    expect(r.lengthM).toBeCloseTo(0.4, 6);
    expect(r.widthM).toBeCloseTo(0.2, 6);
    expect(r.corners).toHaveLength(4);
  });
  it('minAreaRect con pocos puntos', () => {
    expect(minAreaRect([{ x: 0, z: 0 }]).lengthM).toBe(0);
  });
});

describe('altura sobre la superficie de apoyo', () => {
  const floor = { id: 'f', y: 0, cx: 0, cz: 0, lengthM: 4, widthM: 3 };
  const table = { id: 't', y: 0.75, cx: 1, cz: 1, lengthM: 1.2, widthM: 0.8 };
  const box = { id: 'b', y: 0.87, cx: 1.1, cz: 0.9, lengthM: 0.3, widthM: 0.2 };
  it('usa la mesa, no el piso', () => {
    expect(heightAboveSupport(box, [floor, table, box])).toBeCloseTo(0.12, 6);
  });
  it('sin mesa usa el piso', () => {
    expect(heightAboveSupport({ ...box, y: 0.3 }, [floor, box])).toBeCloseTo(0.3, 6);
  });
  it('sin apoyo devuelve null', () => {
    expect(heightAboveSupport(box, [box])).toBeNull();
  });
  it('ignora mesas lejanas', () => {
    const far = { ...table, id: 'far', cx: 10, cz: 10 };
    expect(heightAboveSupport(box, [floor, far, box])).toBeCloseTo(0.87, 6);
  });
});

describe('confiabilidad', () => {
  it('ideal = alta, perdida = baja', () => {
    expect(reliability('good', 'plane', 0.5)).toBe(1);
    expect(reliabilityLabel(reliability('good', 'plane', 0.5))).toBe('Alta');
    expect(reliabilityLabel(reliability('lost', 'featurePoint', 4))).toBe('Baja');
    expect(reliabilityLabel(reliability('limited', 'plane', 1))).toBe('Media');
  });
});

describe('medida por foto', () => {
  it('escala con la tarjeta', () => {
    // la tarjeta (8,56 cm) mide 100 px; el producto 250 px → 21,4 cm
    expect(photoMeasureCm({ x: 0, y: 0 }, { x: 100, y: 0 }, 8.56, { x: 10, y: 10 }, { x: 10, y: 260 })).toBe(21.4);
  });
  it('rechaza referencia degenerada', () => {
    expect(photoMeasureCm({ x: 0, y: 0 }, { x: 1, y: 0 }, 8.56, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
    expect(photoMeasureCm({ x: 0, y: 0 }, { x: 100, y: 0 }, 8.56, { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('utilidades', () => {
  it('toCm y normalizeDims', () => {
    expect(toCm(0.1234)).toBe(12.3);
    expect(normalizeDims({ length: 10, width: 20, height: 5 })).toEqual({ length: 20, width: 10, height: 5 });
  });
  it('maxRelativeDiff ignora el orden', () => {
    expect(maxRelativeDiff([20, 30, 15], [30, 20, 15])).toBe(0);
    expect(maxRelativeDiff([33, 20, 15], [30, 20, 15])).toBeCloseTo(0.1, 6);
  });
  it('iso proyecta el origen al origen y sube con z', () => {
    expect(iso({ x: 0, y: 0, z: 0 })).toEqual({ u: 0, v: 0 });
    expect(iso({ x: 0, y: 0, z: 10 }).v).toBe(-10);
  });
  it('formatos es-CO', () => {
    expect(money(1234567)).toBe('$1.234.567');
    expect(money(-500)).toBe('−$500');
    expect(cm(12.34)).toBe('12,3 cm');
    expect(dims(30, 20.5, 15)).toBe('30 × 20,5 × 15 cm');
    expect(eta(0)).toBe('Mismo día');
    expect(eta(3)).toBe('3 días hábiles');
    expect(waNumber('300 123 4567')).toBe('573001234567');
  });
});

describe('distancia de medición', () => {
  it('clasifica cerca, en rango y lejos', () => {
    expect(distanceStatus(MIN_DISTANCE_M - 0.05)).toBe('cerca');
    expect(distanceStatus(MIN_DISTANCE_M)).toBe('ok');
    expect(distanceStatus(0.6)).toBe('ok');
    expect(distanceStatus(MAX_DISTANCE_M)).toBe('ok');
    expect(distanceStatus(MAX_DISTANCE_M + 0.1)).toBe('lejos');
  });
});
