/**
 * Pruebas de integración: levanta el servidor real con una base PGlite temporal y recorre
 * los flujos de los tres roles, permisos, validaciones, rastreo público y lo legal.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let proc, dir;

async function call(method, p, { token, body } = {}) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, body: json, headers: r.headers };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).body.token;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-test-'));
  proc = spawn(process.execPath, ['src/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), PGLITE_DIR: dir, DATABASE_URL: '', JWT_SECRET: 'test-secret', ADMIN_PASSWORD: 'admin-test-1', SEED_DEMO: 'true', GEMINI_API_KEY: '', NODE_ENV: 'test', APK_URL: 'https://example.com/app.apk', LEGAL_COMPANY: 'Empresa de Prueba SAS' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor no arrancó:\n${log}`);
});

after(() => {
  proc?.kill();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows puede retener archivos */ }
});

describe('público', () => {
  test('healthz, config y cabeceras de seguridad', async () => {
    const r = await call('GET', '/api/config');
    assert.equal(r.status, 200);
    assert.equal(r.body.apkUrl, '/descargar');
    assert.equal(r.body.vision, false);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });
  test('descargar redirige al APK', async () => {
    const r = await fetch(`${BASE}/descargar`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://example.com/app.apk');
  });
  test('página de descarga y legales en HTML', async () => {
    const home = await (await fetch(`${BASE}/`)).text();
    assert.match(home, /Descargar APK/);
    assert.match(home, /\/terminos/);
    const t = await (await fetch(`${BASE}/terminos`)).text();
    assert.match(t, /Términos y Condiciones/);
    assert.match(t, /Empresa de Prueba SAS/);
    assert.doesNotMatch(t, /\{\{/);
    const p = await (await fetch(`${BASE}/privacidad`)).text();
    assert.match(p, /Ley Estatutaria 1581 de 2012/);
  });
  test('legal por API', async () => {
    const r = await call('GET', '/api/legal/terminos');
    assert.equal(r.status, 200);
    assert.equal(r.body.version, '1.2');
    assert.equal((await call('GET', '/api/legal/otro')).status, 404);
  });
  test('ruta API desconocida → 404 JSON', async () => {
    const r = await call('GET', '/api/nada');
    assert.equal(r.status, 404);
    assert.ok(r.body.error);
  });
});

describe('identidad', () => {
  test('login inválido', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: 'tienda@demo.app', password: 'mala' } });
    assert.equal(r.status, 401);
  });
  test('sin token → 401', async () => {
    assert.equal((await call('GET', '/api/products')).status, 401);
    assert.equal((await call('GET', '/api/products', { token: 'basura' })).status, 401);
  });
  test('registro exige aceptar términos y lo registra', async () => {
    const base = { email: `t${Date.now()}@x.co`, password: '12345678', name: 'Ana', role: 'tienda', city: 'Cali', storeName: 'Ana Shop' };
    const no = await call('POST', '/api/auth/register', { body: base });
    assert.equal(no.status, 400);
    assert.match(no.body.error, /Términos/);
    const ok = await call('POST', '/api/auth/register', { body: { ...base, acceptTerms: true } });
    assert.equal(ok.status, 201);
    assert.ok(ok.body.token);
    const exp = await call('GET', '/api/auth/me/export', { token: ok.body.token });
    assert.equal(exp.status, 200);
    assert.equal(exp.body.user.terms_version, '1.2');
    assert.ok(exp.body.user.terms_accepted_at);
    assert.equal(exp.body.store.name, 'Ana Shop');
    const dup = await call('POST', '/api/auth/register', { body: { ...base, acceptTerms: true } });
    assert.equal(dup.status, 400);
  });
  test('validaciones de registro', async () => {
    const r = await call('POST', '/api/auth/register', { body: { email: 'malo', password: '1', name: 'x', city: 'y', acceptTerms: true } });
    assert.equal(r.status, 400);
  });
  test('mensajero queda pendiente hasta aprobación del admin', async () => {
    const email = `m${Date.now()}@x.co`;
    const r = await call('POST', '/api/auth/register', { body: { email, password: '12345678', name: 'Moto', role: 'mensajero', city: 'Bogotá', acceptTerms: true } });
    assert.equal(r.body.pending, true);
    assert.equal((await call('POST', '/api/auth/login', { body: { email, password: '12345678' } })).status, 403);
    const admin = await login('admin@dimensiona.app', 'admin-test-1');
    const users = (await call('GET', '/api/admin/users', { token: admin })).body;
    const u = users.find((x) => x.email === email);
    assert.equal((await call('PATCH', `/api/admin/users/${u.id}`, { token: admin, body: { active: true } })).status, 200);
    assert.ok(await login(email, '12345678'));
  });
  test('no se puede registrar como admin', async () => {
    const email = `a${Date.now()}@x.co`;
    const r = await call('POST', '/api/auth/register', { body: { email, password: '12345678', name: 'X', role: 'admin', city: 'Cali', storeName: 'S', acceptTerms: true } });
    assert.equal(r.status, 201);
    const me = await call('GET', '/api/auth/me', { token: r.body.token });
    assert.equal(me.body.user.role, 'tienda');
  });
});

describe('flujo completo de envío', () => {
  let T, M, A, productId, shipment;
  before(async () => {
    T = await login('tienda@demo.app', 'demo1234');
    M = await login('mensajero@demo.app', 'demo1234');
    A = await login('admin@dimensiona.app', 'admin-test-1');
  });

  test('tienda crea producto medido con AR', async () => {
    const r = await call('POST', '/api/products', { token: T, body: { name: 'Caja de té', length_cm: 18, width_cm: 9, height_cm: 7, weight_kg: 0.3, price: 25000, measured_by: 'ar', confidence: 0.86 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.length_cm, 18);
    productId = r.body.id;
    const bad = await call('POST', '/api/products', { token: T, body: { name: 'x', length_cm: 0, width_cm: 1, height_cm: 1 } });
    assert.equal(bad.status, 400);
  });

  test('recomendación de caja y cotización', async () => {
    const rec = await call('POST', '/api/packing/recommend', { token: T, body: { items: [{ productId, qty: 3 }] } });
    assert.equal(rec.status, 200);
    assert.ok(rec.body.packages[0].fillPct > 0);
    const q = await call('POST', '/api/quotes', { token: T, body: { items: [{ productId, qty: 3 }], destCity: 'Bogotá', codAmount: 75000 } });
    assert.equal(q.status, 200);
    assert.equal(q.body.zone, 'local');
    assert.ok(q.body.quotes.length >= 2);
    assert.ok(q.body.quotes[0].cheapest);
    assert.ok(q.body.quotes.every((x) => x.codFee > 0));
    const qm = await call('POST', '/api/quotes', { token: T, body: { items: [{ productId, qty: 3 }], destCity: 'Bogotá', packing: 'medida' } });
    assert.equal(qm.body.packing, 'medida');
    assert.equal(qm.body.packages[0].box.custom, true);
  });

  test('crear envío valida destinatario', async () => {
    const r = await call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 1 }], recipientName: 'X', recipientPhone: 'abc', address: 'Cl 1', city: 'Bogotá' } });
    assert.equal(r.status, 400);
  });

  test('tienda crea envío con guía', async () => {
    const r = await call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 2 }], recipientName: 'Pedro Pérez', recipientPhone: '3001112233', address: 'Cl 10 #5-20', city: 'Bogotá', codAmount: 50000 } });
    assert.equal(r.status, 201);
    assert.match(r.body.code, /^DM[A-Z0-9]{7}$/);
    assert.equal(r.body.status, 'creado');
    assert.ok(r.body.price > 0 && r.body.courier_fee > 0 && r.body.courier_fee < r.body.price);
    shipment = r.body;
  });

  test('aislamiento: otra tienda no ve el envío', async () => {
    const reg = await call('POST', '/api/auth/register', { body: { email: `o${Date.now()}@x.co`, password: '12345678', name: 'Otra', role: 'tienda', city: 'Cali', storeName: 'Otra', acceptTerms: true } });
    assert.equal((await call('GET', `/api/shipments/${shipment.id}`, { token: reg.body.token })).status, 404);
    assert.equal((await call('PUT', `/api/products/${productId}`, { token: reg.body.token, body: { name: 'hack', length: 1, width: 1, height: 1 } })).status, 404);
  });

  test('permisos por rol', async () => {
    assert.equal((await call('GET', '/api/admin/users', { token: T })).status, 403);
    assert.equal((await call('GET', '/api/admin/users', { token: M })).status, 403);
    assert.equal((await call('POST', '/api/shipments', { token: M, body: {} })).status, 403);
    assert.equal((await call('POST', `/api/shipments/${shipment.id}/status`, { token: T, body: { status: 'entregado' } })).status, 403);
  });

  test('mensajero ve disponible, toma, no puede saltar estados', async () => {
    const av = await call('GET', '/api/courier/available', { token: M });
    assert.ok(av.body.some((s) => s.id === shipment.id));
    assert.equal((await call('POST', `/api/shipments/${shipment.id}/accept`, { token: M })).status, 200);
    assert.equal((await call('POST', `/api/shipments/${shipment.id}/accept`, { token: M })).status, 400);
    const skip = await call('POST', `/api/shipments/${shipment.id}/status`, { token: M, body: { status: 'entregado', receiverName: 'X' } });
    assert.equal(skip.status, 400);
  });

  test('verificación de medidas con AR al recoger', async () => {
    const ok = await call('POST', `/api/shipments/${shipment.id}/verify`, { token: M, body: { length: 20, width: 15, height: 10 } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.matches, true);
    const big = await call('POST', `/api/shipments/${shipment.id}/verify`, { token: M, body: { length: 60, width: 50, height: 40 } });
    assert.equal(big.body.matches, false);
    assert.ok(big.body.chargeableKg > big.body.declaredChargeableKg);
  });

  test('recogido → en ruta → novedad → en ruta → entregado con evidencia', async () => {
    const st = (b) => call('POST', `/api/shipments/${shipment.id}/status`, { token: M, body: b });
    assert.equal((await st({ status: 'recogido' })).status, 200);
    assert.equal((await st({ status: 'en_ruta' })).status, 200);
    assert.equal((await st({ status: 'novedad' })).status, 400); // exige nota
    assert.equal((await st({ status: 'novedad', note: 'No había nadie' })).status, 200);
    assert.equal((await st({ status: 'en_ruta' })).status, 200);
    assert.equal((await st({ status: 'entregado' })).status, 400); // exige quién recibió
    const photo = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
    assert.equal((await st({ status: 'entregado', receiverName: 'Pedro Pérez', photo })).status, 200);
    const d = await call('GET', `/api/shipments/${shipment.id}`, { token: T });
    assert.equal(d.body.status, 'entregado');
    assert.equal(d.body.verified.matches, false);
    assert.ok(d.body.events.some((e) => e.photo === photo));
  });

  test('cancelar solo antes de recoger', async () => {
    assert.equal((await call('POST', `/api/shipments/${shipment.id}/cancel`, { token: T })).status, 400);
    const s2 = (await call('POST', '/api/shipments', { token: T, body: { items: [{ productId, qty: 1 }], recipientName: 'Ana', recipientPhone: '3001112233', address: 'Cl 1', city: 'Cali' } })).body;
    assert.equal(s2.zone, 'nacional');
    assert.equal((await call('POST', `/api/shipments/${s2.id}/cancel`, { token: T })).status, 200);
  });

  test('rastreo público sin datos sensibles', async () => {
    const r = await call('GET', `/api/track/${shipment.code.toLowerCase()}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'entregado');
    assert.equal(r.body.recipient, 'Pedro');
    const raw = JSON.stringify(r.body);
    assert.doesNotMatch(raw, /3001112233/);
    assert.doesNotMatch(raw, /Cl 10/);
    assert.equal((await call('GET', '/api/track/NOEXISTE')).status, 404);
  });

  test('estadísticas por rol', async () => {
    const t = (await call('GET', '/api/stats', { token: T })).body;
    assert.ok(t.entregados >= 1 && t.recaudo >= 50000);
    const m = (await call('GET', '/api/stats', { token: M })).body;
    assert.ok(m.ganancias > 0);
    const a = (await call('GET', '/api/stats', { token: A })).body;
    assert.ok(a.facturado > 0 && Array.isArray(a.byStatus));
  });

  test('admin edita tarifas y cajas', async () => {
    const svcs = (await call('GET', '/api/admin/services', { token: A })).body;
    const s = svcs[0];
    const r = await call('PUT', `/api/admin/services/${s.id}`, { token: A, body: { ...s, rates: { ...s.rates, local: { base: 9999, perKg: 1000, etaDays: 0 } } } });
    assert.equal(r.status, 200);
    const box = await call('POST', '/api/admin/boxes', { token: A, body: { name: 'Tubo', length: 60, width: 8, height: 8, maxWeight: 5, cost: 1500 } });
    assert.equal(box.status, 201);
    assert.equal((await call('POST', '/api/admin/boxes', { token: A, body: { name: 'Mala', length: -1, width: 1, height: 1 } })).status, 400);
  });

  test('visión sin clave → 503 y exige consentimiento', async () => {
    const r = await call('POST', '/api/vision/identify', { token: T, body: { image: 'abc', mediaType: 'image/jpeg', consent: true } });
    assert.equal(r.status, 503);
  });

  test('eliminar cuenta borra sus datos', async () => {
    const reg = await call('POST', '/api/auth/register', { body: { email: `d${Date.now()}@x.co`, password: '12345678', name: 'Del', role: 'tienda', city: 'Cali', storeName: 'Del', acceptTerms: true } });
    assert.equal((await call('DELETE', '/api/auth/me', { token: reg.body.token })).status, 204);
    assert.equal((await call('GET', '/api/auth/me', { token: reg.body.token })).status, 401);
  });
});
