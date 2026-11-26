/** v1.2: avisos en la app, push, WhatsApp/correo al destinatario y baja de avisos. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startServer } from './_server.js';
import { customerMessage, normalizePhone, storeNotice } from '../src/lib/notify.js';

describe('textos de avisos (puro)', () => {
  test('normaliza celulares colombianos e internacionales', () => {
    assert.equal(normalizePhone('300 123 4567'), '573001234567');
    assert.equal(normalizePhone('+57 (300) 123-4567'), '573001234567');
    assert.equal(normalizePhone('+1 415 555 0100'), '14155550100');
    assert.equal(normalizePhone('6011234567'), null); // fijo de Bogotá: no tiene WhatsApp
    assert.equal(normalizePhone(''), null);
  });
  test('mensaje al destinatario con los parámetros de la plantilla', () => {
    const m = customerMessage('en_ruta', { name: 'Camila Torres', store: 'Luna Velas', code: 'DM123', link: 'https://x/rastreo/DM123' });
    assert.deepEqual(m.params, ['Camila', 'Luna Velas', 'va en camino a tu dirección', 'DM123', 'https://x/rastreo/DM123']);
    assert.match(m.text, /^Hola Camila, tu pedido de Luna Velas va en camino/);
    assert.match(customerMessage('novedad', { name: 'A', store: 'S', code: 'C', link: 'L', note: 'No había nadie' }).text, /No había nadie/);
    assert.equal(customerMessage('asignado', {}), null); // no se molesta al cliente con estados internos
  });
  test('aviso a la tienda', () => {
    assert.match(storeNotice('entregado', { code: 'DM1', recipient: 'Ana Ruiz', receiver: 'Pedro Gil' }).body, /Lo recibió Pedro/);
    assert.equal(storeNotice('creado', {}), null);
  });
});

describe('avisos de punta a punta', () => {
  let S, T, M, A, productId, ship;
  before(async () => {
    S = await startServer({ DEMO_STEP_SECONDS: '0.3' });
    T = await S.login('tienda@demo.app', 'demo1234');
    M = await S.login('mensajero@demo.app', 'demo1234');
    A = await S.login('admin@dimensiona.app', 'admin-test-1');
    productId = (await S.call('GET', '/api/products', { token: T })).body[0].id;
  });
  after(() => S?.stop());

  test('crear un envío avisa al destinatario (WhatsApp simulado) y a los mensajeros de la ciudad', async () => {
    await S.call('POST', '/api/notifications/read', { token: M, body: {} });
    const r = await S.call('POST', '/api/shipments', { token: T, body: {
      items: [{ productId, qty: 1 }], recipientName: 'Valentina Ruiz', recipientPhone: '3205556677', recipientEmail: 'vale@correo.co',
      address: 'Cl 80 #20-10', city: 'Bogotá' } });
    assert.equal(r.status, 201);
    ship = r.body;
    assert.equal(ship.recipient_email, 'vale@correo.co');
    const d = (await S.call('GET', `/api/shipments/${ship.id}`, { token: T })).body;
    assert.equal(d.messages.length, 1); // sin SMTP no se envía correo
    assert.equal(d.messages[0].channel, 'whatsapp');
    assert.equal(d.messages[0].to_addr, '573205556677');
    assert.equal(d.messages[0].state, 'simulado');
    assert.match(d.messages[0].body, /Hola Valentina, tu pedido de Luna Velas/);
    const n = (await S.call('GET', '/api/notifications', { token: M })).body;
    assert.ok(n.unread >= 1);
    assert.equal(n.items[0].kind, 'disponible');
    assert.equal(n.items[0].link, '/mensajero/disponibles');
    // el mensajero no ve los mensajes al cliente
    assert.equal((await S.call('GET', `/api/shipments/${ship.id}`, { token: M })).body.messages, undefined);
  });

  test('correo inválido del destinatario se rechaza', async () => {
    const r = await S.call('POST', '/api/shipments', { token: T, body: {
      items: [{ productId, qty: 1 }], recipientName: 'X Y', recipientPhone: '3205556677', recipientEmail: 'no-es-correo', address: 'Cl 1', city: 'Bogotá' } });
    assert.equal(r.status, 400);
  });

  test('cada cambio de estado avisa a la tienda; la novedad también a administración', async () => {
    await S.call('POST', '/api/notifications/read', { token: T, body: {} });
    assert.equal((await S.call('POST', `/api/shipments/${ship.id}/accept`, { token: M })).status, 200);
    await S.call('POST', `/api/shipments/${ship.id}/status`, { token: M, body: { status: 'recogido' } });
    await S.call('POST', `/api/shipments/${ship.id}/status`, { token: M, body: { status: 'en_ruta' } });
    await S.call('POST', `/api/shipments/${ship.id}/status`, { token: M, body: { status: 'novedad', note: 'Portería cerrada' } });
    const n = (await S.call('GET', '/api/notifications', { token: T })).body;
    assert.equal(n.unread, 4);
    assert.deepEqual(n.items.slice(0, 4).map((i) => i.kind), ['envio.novedad', 'envio.en_ruta', 'envio.recogido', 'envio.asignado']);
    assert.equal(n.items[0].link, `/envio/${ship.id}`);
    const a = (await S.call('GET', '/api/notifications', { token: A })).body;
    assert.ok(a.items.some((i) => i.kind === 'envio.novedad' && /Portería cerrada/.test(i.body)));
    const msgs = (await S.call('GET', `/api/shipments/${ship.id}`, { token: T })).body.messages;
    assert.deepEqual(msgs.map((m) => m.status_trigger), ['creado', 'en_ruta', 'novedad']);
  });

  test('marcar como leídos (uno y todos) y contador', async () => {
    const n = (await S.call('GET', '/api/notifications', { token: T })).body;
    await S.call('POST', '/api/notifications/read', { token: T, body: { ids: [n.items[0].id] } });
    assert.equal((await S.call('GET', '/api/notifications/unread', { token: T })).body.unread, n.unread - 1);
    await S.call('POST', '/api/notifications/read', { token: T, body: {} });
    assert.equal((await S.call('GET', '/api/notifications/unread', { token: T })).body.unread, 0);
  });

  test('el destinatario puede dejar de recibir avisos', async () => {
    const t1 = (await S.call('GET', `/api/track/${ship.code}`)).body;
    assert.equal(t1.notifications, true);
    assert.equal((await S.call('POST', `/api/track/${ship.code}/opt-out`)).status, 200);
    assert.equal((await S.call('GET', `/api/track/${ship.code}`)).body.notifications, false);
    await S.call('POST', `/api/shipments/${ship.id}/status`, { token: M, body: { status: 'en_ruta' } });
    await S.call('POST', `/api/shipments/${ship.id}/status`, { token: M, body: { status: 'entregado', receiverName: 'Portero Juan' } });
    const msgs = (await S.call('GET', `/api/shipments/${ship.id}`, { token: T })).body.messages;
    assert.equal(msgs.length, 3); // no se agregaron más
    assert.equal((await S.call('POST', '/api/track/NOEXISTE/opt-out')).status, 404);
  });

  test('preferencias: la tienda apaga los avisos a sus clientes y el push', async () => {
    const p = (await S.call('GET', '/api/notifications/prefs', { token: T })).body;
    assert.equal(p.push, true);
    assert.equal(p.customers, true);
    assert.equal(p.channels.whatsapp, 'simulado');
    await S.call('PUT', '/api/notifications/prefs', { token: T, body: { customers: false, push: false } });
    const p2 = (await S.call('GET', '/api/notifications/prefs', { token: T })).body;
    assert.equal(p2.customers, false);
    assert.equal(p2.push, false);
    const s2 = (await S.call('POST', '/api/shipments', { token: T, body: {
      items: [{ productId, qty: 1 }], recipientName: 'Sin Aviso', recipientPhone: '3001112233', address: 'Cl 1', city: 'Bogotá' } })).body;
    assert.equal((await S.call('GET', `/api/shipments/${s2.id}`, { token: T })).body.messages.length, 0);
    assert.equal((await S.call('PUT', '/api/notifications/prefs', { token: M, body: { customers: true } })).status, 400);
    await S.call('PUT', '/api/notifications/prefs', { token: T, body: { customers: true, push: true } });
  });

  test('registro de token push con validación', async () => {
    assert.equal((await S.call('POST', '/api/notifications/push-token', { token: T, body: { token: 'cualquier-cosa' } })).status, 400);
    const tok = 'ExponentPushToken[abcdefghij123456]';
    assert.equal((await S.call('POST', '/api/notifications/push-token', { token: T, body: { token: tok, platform: 'android' } })).status, 200);
    assert.equal((await S.call('POST', '/api/notifications/push-token', { token: T, body: { token: tok, platform: 'android' } })).status, 200); // idempotente
    assert.equal((await S.call('GET', '/api/admin/messages', { token: A })).body.totals.dispositivos, 1);
    assert.equal((await S.call('DELETE', '/api/notifications/push-token', { token: T, body: { token: tok } })).status, 200);
    assert.equal((await S.call('POST', '/api/notifications/push-token', { body: { token: tok } })).status, 401);
  });

  test('administración ve el registro de mensajes y el estado de los canales', async () => {
    assert.equal((await S.call('GET', '/api/admin/messages', { token: T })).status, 403);
    const r = (await S.call('GET', '/api/admin/messages', { token: A })).body;
    assert.equal(r.channels.whatsapp, 'simulado');
    assert.equal(r.channels.template, 'dimensiona_estado');
    assert.ok(r.items.length >= 3);
    assert.ok(r.totals.simulados >= 3);
    assert.equal((await S.call('GET', '/api/config')).body.notifications.whatsapp, 'simulado');
  });

  test('PQR nueva avisa a administración y su respuesta al usuario', async () => {
    const c = await S.call('POST', '/api/claims', { token: T, body: { type: 'peticion', message: 'Necesito copia de la factura de octubre' } });
    assert.equal(c.status, 201);
    const a = (await S.call('GET', '/api/notifications', { token: A })).body;
    assert.ok(a.items.some((i) => i.kind === 'pqr' && i.title.includes(c.body.number)));
    const list = (await S.call('GET', '/api/claims', { token: A })).body;
    const id = list.find((x) => x.number === c.body.number).id;
    await S.call('POST', `/api/admin/claims/${id}/respond`, { token: A, body: { response: 'Te la enviamos al correo.' } });
    const t = (await S.call('GET', '/api/notifications', { token: T })).body;
    assert.equal(t.items[0].kind, 'pqr.respuesta');
  });

  test('recorrido demo: todos los roles, verificación, novedad y entrega con avisos', async () => {
    const s = (await S.call('POST', '/api/shipments', { token: T, body: {
      items: [{ productId, qty: 1 }], recipientName: 'Demo Recorrido', recipientPhone: '3001112233', address: 'Cl 1', city: 'Bogotá' } })).body;
    await S.call('POST', '/api/notifications/read', { token: A, body: {} });
    const r = await S.call('POST', `/api/demo/shipments/${s.id}/simulate`, { token: T });
    assert.equal(r.status, 200);
    assert.equal(r.body.steps, 7);
    assert.equal((await S.call('POST', `/api/demo/shipments/${s.id}/simulate`, { token: T })).status, 400); // ya en curso
    await new Promise((ok) => setTimeout(ok, 3500));
    const d = (await S.call('GET', `/api/shipments/${s.id}`, { token: T })).body;
    assert.equal(d.status, 'entregado');
    assert.deepEqual(d.events.map((e) => e.status), ['creado', 'asignado', 'asignado', 'recogido', 'en_ruta', 'novedad', 'en_ruta', 'entregado']);
    assert.ok(d.verified?.matches);
    assert.deepEqual(d.messages.map((m) => m.status_trigger), ['creado', 'en_ruta', 'novedad', 'en_ruta', 'entregado']);
    const n = (await S.call('GET', '/api/notifications', { token: T })).body;
    assert.equal(n.items[0].kind, 'envio.entregado');
    const a = (await S.call('GET', '/api/notifications', { token: A })).body;
    assert.ok(a.items.some((i) => i.kind === 'envio.novedad'));
    assert.equal((await S.call('POST', `/api/demo/shipments/${s.id}/simulate`, { token: M })).status, 403);
  });

  test('las cuentas demo quedan con los términos vigentes', async () => {
    const me = (await S.call('GET', '/api/auth/me', { token: T })).body;
    assert.equal(me.terms.accepted, me.terms.current);
  });

  test('mensajero nuevo pendiente avisa a administración; la exportación de datos incluye los avisos', async () => {
    await S.call('POST', '/api/auth/register', { body: { email: `m${Date.now()}@x.co`, password: '12345678', name: 'Moto Nuevo', role: 'mensajero', city: 'Cali', acceptTerms: true } });
    const a = (await S.call('GET', '/api/notifications', { token: A })).body;
    assert.equal(a.items[0].kind, 'mensajero.pendiente');
    const exp = (await S.call('GET', '/api/auth/me/export', { token: T })).body;
    assert.ok(Array.isArray(exp.notifications) && exp.notifications.length > 0);
  });
});
