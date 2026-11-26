/**
 * Servicio de avisos.
 * - Bandeja dentro de la app por usuario (+ push por Expo si el teléfono registró su token).
 * - Avisos al destinatario del envío por WhatsApp (API de Meta o modo simulado) y correo (si dejó correo y hay SMTP).
 * Un aviso que falla nunca tumba la operación que lo originó.
 */
import { Router } from 'express';
import { auth, bad, h } from '../auth.js';
import { config } from '../config.js';
import { many, one, query } from '../db.js';
import { CUSTOMER_STATUSES, customerMessage, normalizePhone, storeNotice } from '../lib/notify.js';
import { channelStatus, sendEmail, sendPush, sendWhatsApp, whatsappEnabled } from '../notify/channels.js';
import { mailEnabled } from './passwords.js';

const log = (e) => console.error('[avisos]', e?.message ?? e);
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

/** Crea avisos en la bandeja de cada usuario y dispara el push en segundo plano. */
export async function notifyUsers(userIds, { kind, title, body = null, link = null }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    for (const id of ids) {
      await query('INSERT INTO notifications (user_id, kind, title, body, link) VALUES ($1,$2,$3,$4,$5)',
        [id, kind, clip(title, 120), clip(body, 400), clip(link, 200)]);
    }
    pushTo(ids, { title, body, link }).catch(log);
  } catch (e) { log(e); }
}

async function pushTo(userIds, { title, body, link }) {
  const rows = await many(`SELECT t.token FROM push_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.user_id = ANY($1::uuid[]) AND u.notify_push AND u.active`, [userIds]);
  if (!rows.length) return;
  const invalid = await sendPush(rows.map((r) => ({
    to: r.token, title, body: body ?? undefined, sound: 'default', channelId: 'avisos', data: link ? { url: link } : {},
  })));
  if (invalid.length) await query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [invalid]);
}

export async function notifyAdmins(payload) {
  try {
    const admins = await many("SELECT id FROM users WHERE role='admin' AND active");
    await notifyUsers(admins.map((a) => a.id), payload);
  } catch (e) { log(e); }
}

/** Avisa a los mensajeros activos de la ciudad de la tienda que hay un envío por tomar. */
export async function notifyAvailable(shipment, storeRef) {
  try {
    if (shipment.carrier !== 'propia') return;
    const store = await one('SELECT name, city FROM stores WHERE id=$1', [storeRef.id]);
    if (!store) return;
    const couriers = await many("SELECT id FROM users WHERE role='mensajero' AND active AND lower(coalesce(city,'')) = lower($1)", [store.city ?? '']);
    await notifyUsers(couriers.map((c) => c.id), {
      kind: 'disponible', title: 'Envío disponible cerca',
      body: `${store.name} · recoger en ${store.city}, entregar en ${shipment.city}.`, link: '/mensajero/disponibles',
    });
  } catch (e) { log(e); }
}

/**
 * Un envío cambió de estado: avisa a la tienda (si no fue ella quien lo cambió), a administración
 * si hay novedad y al destinatario en los momentos clave.
 */
export async function shipmentChanged(shipmentId, status, { actorId = null, note = null, receiver = null } = {}) {
  try {
    const s = await one(`SELECT s.*, st.name AS store_name, st.owner_id, st.notify_customers, u.name AS courier_name
      FROM shipments s JOIN stores st ON st.id = s.store_id LEFT JOIN users u ON u.id = s.courier_id WHERE s.id=$1`, [shipmentId]);
    if (!s) return;
    const carrier = s.carrier !== 'propia' ? (s.carrier === 'servientrega' ? 'Servientrega' : 'Coordinadora') : null;
    const n = storeNotice(status, { code: s.code, recipient: s.recipient_name, courier: s.courier_name, receiver, note, carrier });
    if (n && s.owner_id !== actorId) await notifyUsers([s.owner_id], { kind: `envio.${status}`, ...n, link: `/envio/${s.id}` });
    if (status === 'novedad') {
      await notifyAdmins({ kind: 'envio.novedad', title: `Novedad · ${s.code}`, body: `${s.store_name}: ${note ?? 'revisar'}`, link: `/envio/${s.id}` });
    }
    await notifyCustomer(s, status, { note });
  } catch (e) { log(e); }
}

async function notifyCustomer(s, status, { note }) {
  if (!CUSTOMER_STATUSES.includes(status) || !s.notify_customers || s.recipient_opt_out) return;
  // No repetir el mismo aviso (p. ej. «en ruta» tras una novedad sí se repite: solo se evita el duplicado inmediato).
  const last = await one('SELECT status_trigger FROM customer_messages WHERE shipment_id=$1 ORDER BY created_at DESC LIMIT 1', [s.id]);
  if (last?.status_trigger === status) return;
  const link = `${config.publicUrl}/rastreo/${s.code}`;
  const msg = customerMessage(status, { name: s.recipient_name, store: s.store_name, code: s.code, link, note });
  if (!msg) return;

  const phone = normalizePhone(s.recipient_phone);
  if (phone) {
    const real = whatsappEnabled();
    const row = await one(`INSERT INTO customer_messages (shipment_id, channel, to_addr, status_trigger, body, state)
      VALUES ($1,'whatsapp',$2,$3,$4,$5) RETURNING id`, [s.id, phone, status, msg.text, real ? 'pendiente' : 'simulado']);
    if (real) {
      sendWhatsApp(phone, msg.params)
        .then((pid) => query("UPDATE customer_messages SET state='enviado', provider_id=$1 WHERE id=$2", [pid, row.id]))
        .catch((e) => query("UPDATE customer_messages SET state='fallido', error=$1 WHERE id=$2", [clip(e.message, 300), row.id]).catch(log));
    }
  }
  if (s.recipient_email && mailEnabled()) {
    const row = await one(`INSERT INTO customer_messages (shipment_id, channel, to_addr, status_trigger, body, state)
      VALUES ($1,'email',$2,$3,$4,'pendiente') RETURNING id`, [s.id, s.recipient_email, status, msg.text]);
    sendEmail(s.recipient_email, `Tu pedido de ${s.store_name} · ${s.code}`,
      `${msg.text}\n\nSi no quieres recibir más avisos de este envío, ábrelo en el enlace y elige «No recibir avisos».\n\nDIMENSIONA`)
      .then(() => query("UPDATE customer_messages SET state='enviado' WHERE id=$1", [row.id]))
      .catch((e) => query("UPDATE customer_messages SET state='fallido', error=$1 WHERE id=$2", [clip(e.message, 300), row.id]).catch(log));
  }
}

export async function customerMessagesFor(shipmentId) {
  return many('SELECT id, channel, to_addr, status_trigger, body, state, error, created_at FROM customer_messages WHERE shipment_id=$1 ORDER BY created_at', [shipmentId]);
}

/** Limpieza: avisos de más de 90 días. */
export async function pruneNotifications() {
  try { await query("DELETE FROM notifications WHERE created_at < now() - interval '90 days'"); } catch (e) { log(e); }
}

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', auth(), h(async (req, res) => {
  const items = await many(`SELECT id, kind, title, body, link, read_at, created_at FROM notifications
    WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`, [req.user.id]);
  const u = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ items, unread: u.n });
}));

notificationsRouter.get('/notifications/unread', auth(), h(async (req, res) => {
  const u = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ unread: u.n });
}));

notificationsRouter.post('/notifications/read', auth(), h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string').slice(0, 100) : null;
  if (ids?.length) await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL AND id = ANY($2::uuid[])', [req.user.id, ids]);
  else await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

notificationsRouter.get('/notifications/prefs', auth(), h(async (req, res) => {
  const u = await one('SELECT notify_push FROM users WHERE id=$1', [req.user.id]);
  res.json({ push: u.notify_push, customers: req.store ? !!req.store.notify_customers : null, channels: channelStatus() });
}));

notificationsRouter.put('/notifications/prefs', auth(), h(async (req, res) => {
  const b = req.body ?? {};
  if (typeof b.push === 'boolean') await query('UPDATE users SET notify_push=$1 WHERE id=$2', [b.push, req.user.id]);
  if (typeof b.customers === 'boolean') {
    if (!req.store) throw bad('Solo las tiendas avisan a sus clientes');
    await query('UPDATE stores SET notify_customers=$1 WHERE id=$2', [b.customers, req.store.id]);
  }
  res.json({ ok: true });
}));

const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
notificationsRouter.post('/notifications/push-token', auth(), h(async (req, res) => {
  const token = String(req.body?.token ?? '');
  if (!TOKEN_RE.test(token)) throw bad('Token de notificaciones inválido');
  await query(`INSERT INTO push_tokens (token, user_id, platform) VALUES ($1,$2,$3)
    ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id, platform=EXCLUDED.platform, created_at=now()`,
  [token, req.user.id, clip(req.body?.platform, 20)]);
  res.json({ ok: true });
}));

notificationsRouter.delete('/notifications/push-token', auth(), h(async (req, res) => {
  await query('DELETE FROM push_tokens WHERE token=$1 AND user_id=$2', [String(req.body?.token ?? ''), req.user.id]);
  res.json({ ok: true });
}));

notificationsRouter.get('/admin/messages', auth('admin'), h(async (_req, res) => {
  const rows = await many(`SELECT m.id, m.channel, m.to_addr, m.status_trigger, m.state, m.error, m.created_at, s.code, s.id AS shipment_id
    FROM customer_messages m JOIN shipments s ON s.id = m.shipment_id ORDER BY m.created_at DESC LIMIT 200`);
  const totals = await one(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE state='enviado')::int AS enviados,
      count(*) FILTER (WHERE state='simulado')::int AS simulados,
      count(*) FILTER (WHERE state='fallido')::int AS fallidos,
      (SELECT count(*)::int FROM push_tokens) AS dispositivos
    FROM customer_messages WHERE created_at > now() - interval '30 days'`);
  res.json({ channels: channelStatus(), totals, items: rows });
}));
