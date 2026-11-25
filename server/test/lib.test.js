import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orientations, packUnits, recommendPacking, expandUnits, boundingDims } from '../src/lib/packing.js';
import { chargeableKg, volumetricKg, priceService, quoteAll } from '../src/lib/pricing.js';
import { zoneFor, normCity } from '../src/lib/geo.js';

const BOXES = [
  { id: 's', name: 'S', length: 20, width: 15, height: 10, maxWeight: 5, cost: 1200 },
  { id: 'm', name: 'M', length: 30, width: 20, height: 15, maxWeight: 10, cost: 1800 },
  { id: 'l', name: 'L', length: 40, width: 30, height: 20, maxWeight: 15, cost: 2600 },
];

test('orientations: cubo tiene 1, caja con dos lados iguales 3, distinta 6', () => {
  assert.equal(orientations([5, 5, 5]).length, 1);
  assert.equal(orientations([5, 5, 2]).length, 3);
  assert.equal(orientations([1, 2, 3]).length, 6);
});

test('packUnits: rota para que entre y no se solapan', () => {
  const units = expandUnits([{ name: 'a', length: 18, width: 3, height: 3, qty: 2 }]); // 19×4×4 con relleno
  const { placed, rest } = packUnits(units, [10, 20, 10]);
  assert.equal(rest.length, 0);
  assert.equal(placed.length, 2);
  const [a, b] = placed;
  const sep = a.x + a.l <= b.x || b.x + b.l <= a.x || a.y + a.w <= b.y || b.y + b.w <= a.y || a.z + a.h <= b.z || b.z + b.h <= a.z;
  assert.ok(sep);
});

test('recommendPacking: elige la caja más pequeña donde cabe', () => {
  const r = recommendPacking([{ name: 'vela', length: 8, width: 8, height: 10, weight: 0.4, qty: 2, fragile: true }], BOXES);
  // frágil: 12×12×14 por vela; dos velas → no caben en S (20×15×10), sí en M
  assert.equal(r.packages.length, 1);
  assert.equal(r.packages[0].box.id, 'm');
  assert.ok(r.packages[0].fillPct > 0 && r.packages[0].fillPct <= 100);
  assert.equal(r.totalUnits, 2);
  assert.ok(r.custom);
});

test('recommendPacking: reparte en varios paquetes si no cabe en una', () => {
  const r = recommendPacking([{ name: 'bulto', length: 35, width: 25, height: 15, weight: 4, qty: 3 }], BOXES);
  assert.ok(r.packages.length >= 2);
  assert.equal(r.packages.reduce((s, p) => s + p.units, 0), 3);
});

test('recommendPacking: objeto más grande que el catálogo → caja a medida', () => {
  const r = recommendPacking([{ name: 'tabla', length: 90, width: 10, height: 5, weight: 2 }], BOXES);
  assert.equal(r.packages[0].box.custom, true);
  assert.ok(r.packages[0].box.length >= 91);
});

test('recommendPacking: respeta peso máximo de la caja', () => {
  const r = recommendPacking([{ name: 'pesas', length: 10, width: 10, height: 5, weight: 6 }], BOXES);
  assert.notEqual(r.packages[0].box.id, 's'); // S admite 5 kg
});

test('recommendPacking: rechaza medidas inválidas', () => {
  assert.throws(() => recommendPacking([{ name: 'x', length: 0, width: 1, height: 1 }], BOXES));
  assert.throws(() => recommendPacking([], BOXES));
});

test('boundingDims agrega holgura', () => {
  assert.deepEqual(boundingDims([{ x: 0, y: 0, z: 0, l: 10, w: 5, h: 2 }]), [11, 6, 3]);
});

test('peso volumétrico y cobrable', () => {
  assert.equal(volumetricKg([50, 40, 30]), 12);
  assert.equal(chargeableKg(2, [50, 40, 30]), 12);
  assert.equal(chargeableKg(13.2, [50, 40, 30]), 14);
  assert.equal(chargeableKg(0.1, [10, 10, 10]), 1);
});

const SVC = { id: 'x', name: 'Std', divisor: 5000, insurancePct: 1, minInsurance: 500, codPct: 3, rates: { local: { base: 7000, perKg: 1000, etaDays: 0 }, nacional: { base: 14000, perKg: 3000, etaDays: 4 } } };

test('priceService: base + kg adicional + seguro + contra entrega', () => {
  const q = priceService(SVC, [{ dims: [30, 20, 15], weightKg: 2.5 }], { zone: 'local', declaredValue: 100000, codAmount: 200000 });
  // cobrable = max(2.5, 1.8) → 3 kg; flete = 7000 + 2×1000 = 9000; seguro 1000; recaudo max(3000, 6000)=6000
  assert.equal(q.chargeableKg, 3);
  assert.equal(q.freight, 9000);
  assert.equal(q.insurance, 1000);
  assert.equal(q.codFee, 6000);
  assert.equal(q.total, 16000);
  assert.equal(priceService(SVC, [{ dims: [1, 1, 1], weightKg: 1 }], { zone: 'regional' }), null);
});

test('quoteAll marca el más barato y el más rápido', () => {
  const fast = { ...SVC, id: 'y', name: 'Express', rates: { nacional: { base: 20000, perKg: 3000, etaDays: 2 } } };
  const r = quoteAll([SVC, fast], [{ dims: [20, 15, 10], weightKg: 1 }], { originCity: 'Bogotá', destCity: 'Medellín' });
  assert.equal(r.zone, 'nacional');
  assert.equal(r.quotes[0].serviceId, 'x');
  assert.ok(r.quotes[0].cheapest);
  assert.ok(r.quotes.find((q) => q.serviceId === 'y').fastest);
});

test('zonas en Colombia', () => {
  assert.equal(normCity('Bogotá D.C.'), 'bogota');
  assert.equal(zoneFor('Bogotá', 'bogota'), 'local');
  assert.equal(zoneFor('Bogotá', 'Soacha'), 'regional');
  assert.equal(zoneFor('Medellín', 'Envigado'), 'regional');
  assert.equal(zoneFor('Bogotá', 'Cali'), 'nacional');
  assert.equal(zoneFor('Bogotá', 'Pueblo Desconocido'), 'nacional');
});
