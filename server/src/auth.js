import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);
export const forbidden = (msg = 'No tienes permiso para esta acción') => new HttpError(403, msg);
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg);

/** Envuelve un handler async para que los errores lleguen al manejador central. */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });
}

/** Exige sesión; opcionalmente uno de los roles indicados. Deja req.user y, si es tienda, req.store. */
export function auth(...roles) {
  return h(async (req, _res, next) => {
    const hdr = req.headers.authorization ?? '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) throw new HttpError(401, 'Inicia sesión para continuar');
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { throw new HttpError(401, 'Tu sesión expiró, vuelve a entrar'); }
    const user = await one('SELECT id, email, name, role, phone, city, vehicle, active FROM users WHERE id = $1', [payload.sub]);
    if (!user) throw new HttpError(401, 'Usuario no encontrado');
    if (!user.active) throw new HttpError(403, user.role === 'mensajero' ? 'Tu cuenta de mensajero está pendiente de aprobación' : 'Cuenta desactivada');
    if (roles.length && !roles.includes(user.role)) throw forbidden();
    req.user = user;
    if (user.role === 'tienda') req.store = await one('SELECT * FROM stores WHERE owner_id = $1', [user.id]);
    next();
  });
}

/** Convierte números de Postgres (numeric → string) a number en filas planas. */
export function nums(row, keys) {
  if (!row) return row;
  const out = { ...row };
  for (const k of keys) if (out[k] != null) out[k] = Number(out[k]);
  return out;
}
