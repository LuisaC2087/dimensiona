/** v1.1: transportadoras, rótulos, facturación, liquidaciones, PQR, contraseñas, marca. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startServer } from './_server.js';
import { splitIva, periodRange } from '../src/services/billing.js';

let S, T, M, A, productId, carrierShip;

before(async () => {
  S = await startServer({ CARRIER_SIM_MINUTES_PER_STEP: '0.02' }); // 1,2 s por paso
  T = await S.login('tienda@demo.app', 'demo1234');
  M = await S.login('mensajero@demo.app', 'demo1234');
  A = await S.login('admin@dimensiona.app', 'admin-test-1');
  productId = (await S.call('GET', '/api/products', { token: T })).body[0].id;
});
after(() => S?.stop());

test('IVA incluido y periodos (puro)', () => {
  assert.deepEqual(splitIva(11900, 19), { subtotal: 10000, iva: 1900, total: 11900 });
  const r = periodRange('2026-12');
  assert.equal(r.from, '2026-12-01T00:00:00.000Z');
  assert.equal(r.to, '2027-01-01T00:00:00.000Z');
  assert.throws(() => periodRange('2026-1'));
});

describe('operación', () => {
  test('healthz verifica la base de datos y entrega la versión', async () => {
    const r = await S.call('GET', '/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.body.db, true);
    assert.ok(r.body.version);
  });
  test('panel de admin incluye alertas de facturación y PQR', async () => {
    const st = (await S.call('GET', '/api/stats', { token: A })).body;
    for (const k of ['sinFacturarMesAnterior', 'facturasVencidas', 'liquidacionesPendientes', 'pqrAbiertas', 'pqrPorVencer']) assert.equal(typeof st[k], 'number', k);
  });
});

describe('marca y configuración', () => {
  test('manual de marca, logos y config pública', async () => {
    assert.equal((await fetch(`${S.base}/marca`)).status, 200);
    assert.equal((await fetch(`${S.base}/brand/logo-mark.svg`)).status, 200);
    const c = (await S.call('GET', '/api/config')).body;
    assert.deepEqual(c.carriers.map((x) => x.id), ['propia', 'servientrega', 'coordinadora']);
    assert.equal(c.carriers[1].mode, 'simulado');
    assert.equal(c.mail, false);
  });
});

describe('transportadoras', () => {
  test('cotización incluye Servientrega y Coordinadora', async () => {
    const q = (await S.call('POST', '/api/quotes', { token: T, body: { items: [{ productId, qty: 1 }], destCity: 'Cali' } })).body;
    const carriers = q.quotes.map((x) => x.carrier);
    assert.ok(carriers.includes('servientrega') && carriers.includes('coordinadora'));
  });

  test('envío con Coordinadora: guía, recogida y rastreo simulado', async () => {
    const q = (await S.call('POST', '/api/quotes', { token: T, body: { items: [{ productId, qty: 1 }], destCity: 'Cali' } })).body;
    const svc = q.quotes.find((x) => x.carrier === 'coordinadora');
    const r = await S.call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 1 }], recipientName: 'Lina Mora', recipientPhone: '3001234567', address: 'Cl 5 #10-20', city: 'Cali', serviceId: svc.serviceId, codAmount: 40000 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.carrier, 'coordinadora');
    assert.match(r.body.carrier_guide, /^7\d{10}$/);
    assert.equal(r.body.courier_fee, 0);
    carrierShip = r.body;
    assert.ok(!(await S.call('GET', '/api/courier/available', { token: M })).body.some((s) => s.id === carrierShip.id));
    assert.equal((await S.call('POST', `/api/shipments/${carrierShip.id}/accept`, { token: M })).status, 400);
    assert.equal((await S.call('POST', `/api/shipments/${carrierShip.id}/pickup`, { token: T, body: { date: '2020-01-01' } })).status, 400);
    const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 6 ? 2 : 1));
    const p = await S.call('POST', `/api/shipments/${carrierShip.id}/pickup`, { token: T, body: { date: d.toISOString().slice(0, 10), window: 'tarde' } });
    assert.equal(p.status, 200);
    assert.match(p.body.id, /^REC-/);
    await new Promise((res) => setTimeout(res, 7000));
    const t = (await S.call('GET', `/api/track/${carrierShip.carrier_guide}`)).body;
    assert.equal(t.status, 'entregado');
    assert.equal(t.carrier.name, 'Coordinadora');
    assert.ok(t.events.some((e) => /Coordinadora: En reparto/.test(e.note ?? '')));
  });

  test('envío de la red propia no admite agendar recogida', async () => {
    const r = await S.call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 1 }], recipientName: 'Ana', recipientPhone: '3001234567', address: 'Cl 1', city: 'Bogotá' } });
    assert.equal(r.body.carrier, 'propia');
    assert.equal((await S.call('POST', `/api/shipments/${r.body.id}/pickup`, { token: T, body: { date: '2030-01-02' } })).status, 400);
  });

  test('rótulo imprimible con enlace firmado y permisos', async () => {
    const l = await S.call('POST', '/api/print-links', { token: T, body: { doc: 'label', id: carrierShip.id } });
    assert.equal(l.status, 200);
    const html = await (await fetch(`${S.base}${l.body.url}`)).text();
    assert.match(html, /data:image\/png;base64/);
    assert.match(html, new RegExp(carrierShip.code));
    assert.equal((await fetch(`${S.base}/imprimir/label/${carrierShip.id}?t=malo`)).status, 401);
    assert.equal((await S.call('POST', '/api/print-links', { token: M, body: { doc: 'label', id: carrierShip.id } })).status, 404);
  });
});

describe('facturación y liquidaciones', () => {
  test('cuenta de cobro por envío, impresión, pago y protección', async () => {
    const period = new Date().toISOString().slice(0, 7);
    assert.equal((await S.call('POST', '/api/admin/billing/run', { token: T, body: { period } })).status, 403);
    assert.equal((await S.call('POST', '/api/admin/billing/run', { token: A, body: { period: '2026-13' } })).status, 400);
    const sh = (await S.call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 1 }], recipientName: 'Ana', recipientPhone: '3001234567', address: 'Cl 1', city: 'Bogotá' } })).body;
    const b = (await S.call('GET', '/api/billing', { token: T })).body;
    const inv = b.invoices.find((i) => i.items.some((it) => it.shipmentId === sh.id));
    assert.ok(inv, 'cada envío genera su cuenta de cobro al crearse');
    assert.equal(inv.items.length, 1);
    assert.equal(inv.total, sh.price);
    assert.equal(inv.subtotal + inv.iva, inv.total);
    assert.match(inv.number, /^DM-\d{6}$/);
    await S.call('POST', '/api/admin/billing/run', { token: A, body: { period } }); // recupera envíos sin cuenta (datos demo)
    assert.equal((await S.call('POST', '/api/admin/billing/run', { token: A, body: { period } })).body.invoices.length, 0);
    assert.ok(b.invoices.length >= 1 && b.owed > 0);
    const link = (await S.call('POST', '/api/print-links', { token: T, body: { doc: 'invoice', id: b.invoices[0].id } })).body.url;
    assert.match(await (await fetch(`${S.base}${link}`)).text(), /Cuenta de cobro/);
    assert.equal((await S.call('POST', `/api/admin/invoices/${b.invoices[0].id}/pay`, { token: A, body: { ref: 'TRX-1' } })).status, 200);
    assert.equal((await S.call('POST', `/api/admin/invoices/${b.invoices[0].id}/pay`, { token: A })).status, 400);
    assert.equal((await S.call('POST', `/api/admin/invoices/${b.invoices[0].id}/void`, { token: A })).status, 400);
  });

  test('anular una factura libera sus envíos', async () => {
    await S.call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 1 }], recipientName: 'Ana', recipientPhone: '3001234567', address: 'Cl 1', city: 'Bogotá' } });
    const period = new Date().toISOString().slice(0, 7);
    const inv = (await S.call('GET', '/api/billing', { token: T })).body.invoices.find((i) => i.status === 'pendiente');
    assert.equal((await S.call('POST', `/api/admin/invoices/${inv.id}/void`, { token: A })).status, 200);
    assert.equal((await S.call('POST', '/api/admin/billing/run', { token: A, body: { period } })).body.invoices.length, 1);
  });

  test('liquidaciones de recaudos y pagos a mensajeros con bitácora', async () => {
    const r = (await S.call('POST', '/api/admin/settlements/run', { token: A })).body;
    assert.ok(r.some((s) => s.kind === 'tienda') && r.some((s) => s.kind === 'mensajero'));
    assert.equal((await S.call('POST', '/api/admin/settlements/run', { token: A })).body.length, 0);
    const pay = (await S.call('GET', '/api/payouts', { token: M })).body;
    assert.ok(pay.settlements.length >= 1);
    assert.equal((await S.call('POST', `/api/admin/settlements/${pay.settlements[0].id}/pay`, { token: A, body: { ref: 'NEQUI-9' } })).status, 200);
    const audit = (await S.call('GET', '/api/admin/audit', { token: A })).body;
    assert.ok(audit.some((a) => a.action === 'settlement.pay'));
    assert.equal((await S.call('GET', '/api/admin/audit', { token: T })).status, 403);
  });
});

describe('PQR y contraseñas', () => {
  test('PQR: destinatario con guía, tienda con sesión, respuesta de admin', async () => {
    assert.equal((await S.call('POST', '/api/claims', { body: { type: 'queja', name: 'X', contact: 'x@x.co', message: 'Llegó tarde mi pedido' } })).status, 401);
    const pub = await S.call('POST', '/api/claims', { body: { type: 'reclamo', name: 'Lina', contact: '3001234567', message: 'La caja llegó golpeada', code: carrierShip.code } });
    assert.equal(pub.status, 201);
    assert.match(pub.body.number, /^PQR-\d{4}-\d{5}$/);
    assert.equal((await S.call('POST', '/api/claims', { token: T, body: { type: 'peticion', message: 'Necesito certificado de entrega' } })).status, 201);
    assert.equal((await S.call('GET', '/api/claims', { token: T })).body.length, 1);
    const c = (await S.call('GET', '/api/claims', { token: A })).body.find((x) => x.number === pub.body.number);
    assert.equal((await S.call('POST', `/api/admin/claims/${c.id}/respond`, { token: A, body: { response: 'Reconocemos el valor declarado.' } })).status, 200);
    assert.equal((await S.call('GET', `/api/claims/${pub.body.number}/status`)).body.status, 'cerrada');
  });

  test('olvido de contraseña genérico y contraseña temporal por admin', async () => {
    const f = await S.call('POST', '/api/auth/forgot', { body: { email: 'noexiste@x.co' } });
    assert.equal(f.status, 200);
    assert.equal(f.body.mail, false);
    assert.equal((await S.call('POST', '/api/auth/reset', { body: { token: 'x', password: '12345678' } })).status, 400);
    const m = (await S.call('GET', '/api/admin/users', { token: A })).body.find((u) => u.email === 'mensajero@demo.app');
    const tmp = (await S.call('POST', `/api/admin/users/${m.id}/temp-password`, { token: A })).body;
    assert.ok(tmp.tempPassword.length >= 8);
    assert.ok(await S.login('mensajero@demo.app', tmp.tempPassword));
  });
});
