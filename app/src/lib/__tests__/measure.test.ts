import {
  aiBoxBase, depthFromAi, measureFromBox, rayOnFacingPlane, distance3, distanceStatus, heightAboveSupport, MAX_DISTANCE_M, MIN_DISTANCE_M, iso, maxRelativeDiff, median, minAreaRect, normalizeDims, photoMeasureCm, reliability, reliabilityLabel, toCm,
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

describe('aiBoxBase', () => {
  const table = { id: 't', y: 0.75, cx: 0, cz: -0.5, lengthM: 1.2, widthM: 0.6 };
  it('apoya la caja en la mesa y la corre media profundidad lejos de la cámara', () => {
    const b = aiBoxBase({ x: 0, y: 0.88, z: -0.5 }, { x: 0, y: 1.2, z: 0 }, [table], { widthM: 0.08, heightM: 0.25 });
    expect(b.y).toBeCloseTo(0.75);
    expect(b.z).toBeCloseTo(-0.54);
  });
  it('sin superficie de apoyo centra la caja en el punto tocado', () => {
    const b = aiBoxBase({ x: 0, y: 0.88, z: -0.5 }, { x: 0, y: 1.2, z: 0 }, [], { widthM: 0.08, heightM: 0.2 });
    expect(b.y).toBeCloseTo(0.78);
  });
});

describe('medida por geometría (IA + mesa)', () => {
  // Cámara a 1,2 m de altura mirando una botella de 8 cm de ancho y 25 cm de alto apoyada en una mesa (y = 0,75) a 0,5 m.
  const cam = { x: 0, y: 1.2, z: 0 };
  const base = { x: 0, y: 0.75, z: -0.5 };
  const ray = (to: { x: number; y: number; z: number }) => ({ origin: cam, dir: { x: to.x - cam.x, y: to.y - cam.y, z: to.z - cam.z } });
  it('corta el rayo en el plano vertical del frente del producto', () => {
    const p = rayOnFacingPlane(cam, { x: 0, y: -0.2, z: -1 }, base, cam)!;
    expect(p.z).toBeCloseTo(-0.5);
    expect(p.y).toBeCloseTo(1.1);
  });
  it('obtiene alto y ancho a partir del recuadro', () => {
    const m = measureFromBox(cam, base, { top: ray({ x: 0, y: 1.0, z: -0.5 }), left: ray({ x: -0.04, y: 0.76, z: -0.5 }), right: ray({ x: 0.04, y: 0.76, z: -0.5 }) })!;
    expect(m.heightM).toBeCloseTo(0.25);
    expect(m.widthM).toBeCloseTo(0.08);
  });
  it('descarta medidas imposibles', () => {
    expect(measureFromBox(cam, base, { top: ray({ x: 0, y: 0.7, z: -0.5 }), left: ray({ x: -0.04, y: 0.76, z: -0.5 }), right: ray({ x: 0.04, y: 0.76, z: -0.5 }) })).toBeNull();
  });
  it('la profundidad sale de la IA, escalada por el ancho medido', () => {
    expect(depthFromAi(10, { largo: 10, ancho: 8 })).toBe(8);
    expect(depthFromAi(12, { largo: 10, ancho: 8 })).toBe(9.6);
    expect(depthFromAi(10, { largo: null, ancho: 8 })).toBeNull();
  });
});
