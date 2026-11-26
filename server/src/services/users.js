/** Servicio de identidad y administración. */
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { auth, bad, h, HttpError, notFound, signToken } from '../auth.js';
import { many, one, query } from '../db.js';
import { loadBoxes, loadServices } from './catalog.js';
import { LEGAL_VERSION } from './legal.js';
import { audit } from './audit.js';
import { notifyAdmins } from './notifications.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, city: u.city, vehicle: u.vehicle, active: u.active });

// Límite simple de intentos de ingreso por IP (memoria).
const attempts = new Map();
function throttle(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (a.length >= 20) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
  a.push(now);
  attempts.set(ip, a);
}

export const usersRouter = Router();

usersRouter.post('/auth/register', h(async (req, res) => {
  throttle(req.ip);
  const b = req.body ?? {};
  const email = String(b.email ?? '').trim().toLowerCase();
  const name = String(b.name ?? '').trim().slice(0, 80);
  const role = b.role === 'mensajero' ? 'mensajero' : 'tienda';
  const city = String(b.city ?? '').trim().slice(0, 60);
  if (!EMAIL.test(email)) throw bad('Correo inválido');
  if (String(b.password ?? '').length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
  if (!name || !city) throw bad('Nombre y ciudad son obligatorios');
  if (role === 'tienda' && !String(b.storeName ?? '').trim()) throw bad('Escribe el nombre de tu emprendimiento');
  if (b.acceptTerms !== true) throw bad('Debes aceptar los Términos y Condiciones y la Política de Tratamiento de Datos');
  if (await one('SELECT 1 FROM users WHERE email=$1', [email])) throw bad('Ya existe una cuenta con ese correo');
  const hash = await bcrypt.hash(String(b.password), 10);
  // Los mensajeros quedan pendientes hasta que administración los apruebe.
  const user = await one(
    `INSERT INTO users (email, password_hash, name, role, phone, city, vehicle, active, terms_version, terms_accepted_at, terms_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10) RETURNING *`,
    [email, hash, name, role, String(b.phone ?? '').slice(0, 20) || null, city, role === 'mensajero' ? String(b.vehicle ?? 'Moto').slice(0, 20) : null, role !== 'mensajero', LEGAL_VERSION, req.ip]);
  if (role === 'tienda') {
    await query('INSERT INTO stores (owner_id, name, city, address, channel, instagram, whatsapp) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.id, String(b.storeName).trim().slice(0, 80), city, b.address ?? null, b.channel ?? null, b.instagram ?? null, b.phone ?? null]);
  }
  if (!user.active) {
    await notifyAdmins({ kind: 'mensajero.pendiente', title: 'Mensajero por aprobar', body: `${user.name} · ${user.city ?? ''}`, link: '/admin/usuarios' });
    return res.status(201).json({ pending: true, user: publicUser(user) });
  }
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

usersRouter.post('/auth/login', h(async (req, res) => {
  throttle(req.ip);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const user = await one('SELECT * FROM users WHERE email=$1', [email]);
  if (!user || !(await bcrypt.compare(String(req.body?.password ?? ''), user.password_hash))) throw new HttpError(401, 'Correo o contraseña incorrectos');
  if (!user.active) throw new HttpError(403, user.role === 'mensajero' ? 'Tu cuenta de mensajero está pendiente de aprobación por administración' : 'Cuenta desactivada');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

usersRouter.get('/auth/me', auth(), h(async (req, res) => {
  const t = await one('SELECT terms_version FROM users WHERE id=$1', [req.user.id]);
  res.json({ user: publicUser(req.user), store: req.store ?? null, terms: { accepted: t?.terms_version ?? null, current: LEGAL_VERSION } });
}));

// Aceptar una versión nueva de los términos (queda registrada con fecha e IP)
usersRouter.post('/auth/accept-terms', auth(), h(async (req, res) => {
  if (req.body?.version !== LEGAL_VERSION) throw bad('Versión de términos desactualizada');
  await query('UPDATE users SET terms_version=$1, terms_accepted_at=now(), terms_ip=$2 WHERE id=$3', [LEGAL_VERSION, req.ip, req.user.id]);
  await audit(req.user.id, 'terms.accept', LEGAL_VERSION);
  res.json({ ok: true });
}));

usersRouter.patch('/auth/me', auth(), h(async (req, res) => {
  const b = req.body ?? {};
  const u = await one('UPDATE users SET name=coalesce($1,name), phone=coalesce($2,phone), city=coalesce($3,city), vehicle=coalesce($4,vehicle) WHERE id=$5 RETURNING *',
    [b.name || null, b.phone || null, b.city || null, b.vehicle || null, req.user.id]);
  if (b.newPassword) {
    if (String(b.newPassword).length < 8) throw bad('La contraseña nueva debe tener al menos 8 caracteres');
    const full = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await bcrypt.compare(String(b.password ?? ''), full.password_hash))) throw bad('La contraseña actual no coincide');
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(b.newPassword), 10), req.user.id]);
  }
  res.json({ user: publicUser(u) });
}));

usersRouter.get('/auth/me/export', auth(), h(async (req, res) => {
  const u = await one('SELECT id, email, name, role, phone, city, vehicle, active, created_at, terms_version, terms_accepted_at FROM users WHERE id=$1', [req.user.id]);
  const store = await one('SELECT * FROM stores WHERE owner_id=$1', [req.user.id]);
  const products = store ? await many('SELECT * FROM products WHERE store_id=$1', [store.id]) : [];
  const shipments = store
    ? await many('SELECT code, status, recipient_name, recipient_phone, address, city, price, created_at FROM shipments WHERE store_id=$1', [store.id])
    : await many('SELECT code, status, city, courier_fee, created_at FROM shipments WHERE courier_id=$1', [req.user.id]);
  const notifications = await many('SELECT kind, title, body, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-dimensiona.json"');
  res.json({ exportedAt: new Date().toISOString(), user: u, store, products, shipments, notifications });
}));

usersRouter.delete('/auth/me', auth('tienda', 'mensajero'), h(async (req, res) => {
  await query('DELETE FROM users WHERE id=$1', [req.user.id]); // tienda, productos y envíos se borran en cascada
  res.status(204).end();
}));

// ─── Administración ───
usersRouter.get('/admin/users', auth('admin'), h(async (req, res) => {
  const rows = await many(`SELECT u.id, u.email, u.name, u.role, u.phone, u.city, u.vehicle, u.active, u.created_at, s.name AS store_name,
      (SELECT count(*)::int FROM shipments sh WHERE sh.store_id = s.id OR sh.courier_id = u.id) AS envios
    FROM users u LEFT JOIN stores s ON s.owner_id = u.id ORDER BY u.active, u.created_at DESC`);
  res.json(rows);
}));
usersRouter.patch('/admin/users/:id', auth('admin'), h(async (req, res) => {
  if (req.params.id === req.user.id) throw bad('No puedes modificar tu propia cuenta desde aquí');
  const u = await one('UPDATE users SET active=coalesce($1, active) WHERE id=$2 RETURNING id, active', [typeof req.body?.active === 'boolean' ? req.body.active : null, req.params.id]);
  if (!u) throw notFound();
  await audit(req.user.id, u.active ? 'user.activate' : 'user.deactivate', req.params.id);
  res.json(u);
}));
usersRouter.get('/admin/couriers', auth('admin'), h(async (_req, res) => {
  res.json(await many("SELECT id, name, city, vehicle FROM users WHERE role='mensajero' AND active ORDER BY name"));
}));

const n = (v, name, min = 0) => { const x = Number(v); if (!Number.isFinite(x) || x < min) throw bad(`${name} inválido`); return x; };

usersRouter.get('/admin/boxes', auth('admin'), h(async (_req, res) => res.json(await loadBoxes(false))));
usersRouter.post('/admin/boxes', auth('admin'), h(async (req, res) => {
  const b = req.body ?? {};
  const row = await one('INSERT INTO boxes (name, length_cm, width_cm, height_cm, max_weight_kg, cost) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [String(b.name || 'Caja').slice(0, 40), n(b.length, 'Largo', 1), n(b.width, 'Ancho', 1), n(b.height, 'Alto', 0.5), n(b.maxWeight ?? 20, 'Peso máx.', 0.1), n(b.cost ?? 0, 'Costo')]);
  res.status(201).json(row);
}));
usersRouter.put('/admin/boxes/:id', auth('admin'), h(async (req, res) => {
  const b = req.body ?? {};
  const row = await one('UPDATE boxes SET name=$1, length_cm=$2, width_cm=$3, height_cm=$4, max_weight_kg=$5, cost=$6, active=$7 WHERE id=$8 RETURNING id',
    [String(b.name || 'Caja').slice(0, 40), n(b.length, 'Largo', 1), n(b.width, 'Ancho', 1), n(b.height, 'Alto', 0.5), n(b.maxWeight ?? 20, 'Peso máx.', 0.1), n(b.cost ?? 0, 'Costo'), b.active !== false, req.params.id]);
  if (!row) throw notFound();
  await audit(req.user.id, 'service.update', req.params.id, { rates });
  res.json(row);
}));

usersRouter.get('/admin/services', auth('admin'), h(async (_req, res) => res.json(await loadServices(false))));
usersRouter.put('/admin/services/:id', auth('admin'), h(async (req, res) => {
  const b = req.body ?? {};
  const rates = {};
  for (const z of ['local', 'regional', 'nacional']) {
    const r = b.rates?.[z];
    if (!r) continue;
    rates[z] = { base: n(r.base, `Base ${z}`), perKg: n(r.perKg, `Kg adicional ${z}`), etaDays: n(r.etaDays, `Días ${z}`) };
  }
  if (!Object.keys(rates).length) throw bad('El servicio necesita al menos una zona');
  const row = await one(`UPDATE services SET name=$1, description=$2, divisor=$3, insurance_pct=$4, cod_pct=$5, courier_share_pct=$6, rates=$7, active=$8
    WHERE id=$9 RETURNING id`,
    [String(b.name ?? '').slice(0, 60) || 'Servicio', b.description ?? null, n(b.divisor ?? 5000, 'Divisor', 1000), n(b.insurancePct ?? 1, 'Seguro'), n(b.codPct ?? 3, 'Contra entrega'),
      n(b.courierSharePct ?? 70, 'Participación'), JSON.stringify(rates), b.active !== false, req.params.id]);
  if (!row) throw notFound();
  res.json(row);
}));
