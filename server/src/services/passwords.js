/**
 * Recuperación de contraseña.
 * - «Olvidé mi contraseña»: token de un solo uso (30 min) enviado por correo si hay SMTP
 *   configurado (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
 * - Sin SMTP, administración puede generar una contraseña temporal para el usuario.
 * La respuesta a «olvidé» es siempre la misma para no revelar qué correos existen.
 */
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { auth, bad, h, HttpError, notFound } from '../auth.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { audit } from './audit.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const env = process.env;
export const mailEnabled = () => !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

export async function sendMail(to, subject, text) {
  const { default: nodemailer } = await import('nodemailer');
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587), secure: Number(env.SMTP_PORT) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await t.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to, subject, text });
}

const tries = new Map();
function throttle(key) {
  const now = Date.now();
  const a = (tries.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  if (a.length >= 5) throw new HttpError(429, 'Demasiadas solicitudes. Espera unos minutos.');
  a.push(now);
  tries.set(key, a);
}

export const passwordsRouter = Router();

passwordsRouter.post('/auth/forgot', h(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  throttle(req.ip + email);
  const generic = { ok: true, mail: mailEnabled(), message: mailEnabled()
    ? 'Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva (vence en 30 minutos).'
    : 'Escribe a soporte desde el correo de tu cuenta y administración te dará una contraseña temporal.' };
  const user = await one('SELECT id, name FROM users WHERE email=$1 AND active', [email]);
  if (!user || !mailEnabled()) return res.json(generic);
  const token = randomBytes(24).toString('base64url');
  await query("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '30 minutes')", [sha(token), user.id]);
  const link = `${config.publicUrl}/app/restablecer?token=${token}`;
  try {
    await sendMail(email, 'DIMENSIONA · Crea una contraseña nueva',
      `Hola ${user.name.split(' ')[0]},\n\nPara crear una contraseña nueva abre este enlace (vence en 30 minutos):\n${link}\n\nSi no lo pediste, ignora este correo.\n\nDIMENSIONA`);
  } catch (e) { console.error('[mail]', e.message); }
  res.json(generic);
}));

passwordsRouter.post('/auth/reset', h(async (req, res) => {
  const token = String(req.body?.token ?? '');
  const pwd = String(req.body?.password ?? '');
  if (pwd.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
  const r = await one('SELECT user_id FROM password_resets WHERE token_hash=$1 AND NOT used AND expires_at > now()', [sha(token)]);
  if (!r) throw bad('El enlace no es válido o ya venció. Pide uno nuevo.');
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(pwd, 10), r.user_id]);
  await query('UPDATE password_resets SET used=true WHERE user_id=$1', [r.user_id]);
  await audit(r.user_id, 'password.reset');
  res.json({ ok: true });
}));

passwordsRouter.post('/admin/users/:id/temp-password', auth('admin'), h(async (req, res) => {
  if (req.params.id === req.user.id) throw bad('Cambia tu propia contraseña desde Cuenta');
  const temp = randomBytes(6).toString('base64url');
  const r = await one('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING email', [await bcrypt.hash(temp, 10), req.params.id]);
  if (!r) throw notFound();
  await audit(req.user.id, 'password.temp', req.params.id);
  res.json({ email: r.email, tempPassword: temp });
}));
