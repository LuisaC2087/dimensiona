/**
 * PQR: peticiones, quejas, reclamos y sugerencias (exigidas por la regulación de servicios
 * postales y la Ley 1480). Las puede radicar una tienda con sesión o un destinatario con su guía.
 * Plazo de respuesta: 15 días hábiles (≈ 21 días calendario).
 */
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { bad, h, HttpError, auth, notFound } from '../auth.js';
import { config } from '../config.js';
import { many, one } from '../db.js';
import { audit } from './audit.js';
import { notifyAdmins, notifyUsers } from './notifications.js';

const TYPES = ['peticion', 'queja', 'reclamo', 'sugerencia'];
const clean = (v, n) => String(v ?? '').trim().slice(0, n);

/** Sesión opcional: si llega un token válido se asocia el usuario. */
async function optionalUser(req) {
  const hdr = req.headers.authorization ?? '';
  if (!hdr.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(hdr.slice(7), config.jwtSecret);
    return await one('SELECT id, name, email, role FROM users WHERE id=$1 AND active', [p.sub]);
  } catch { return null; }
}

export const claimsRouter = Router();

claimsRouter.post('/claims', h(async (req, res) => {
  const b = req.body ?? {};
  const user = await optionalUser(req);
  const type = TYPES.includes(b.type) ? b.type : null;
  if (!type) throw bad('Elige el tipo: petición, queja, reclamo o sugerencia');
  const message = clean(b.message, 2000);
  if (message.length < 10) throw bad('Describe tu solicitud (mínimo 10 caracteres)');
  const name = clean(b.name ?? user?.name, 80), contact = clean(b.contact ?? user?.email, 120);
  if (!name || !contact) throw bad('Escribe tu nombre y un correo o celular de contacto');
  let shipmentId = null;
  if (b.code) {
    const s = await one('SELECT id, recipient_phone, store_id FROM shipments WHERE upper(code)=upper($1)', [clean(b.code, 20)]);
    if (!s) throw bad('No encontramos esa guía');
    shipmentId = s.id;
  }
  if (!user && !shipmentId) throw new HttpError(401, 'Para radicar sin cuenta indica el código de tu guía');
  const seq = await one("SELECT nextval('claim_number_seq')::int AS n");
  const number = `PQR-${new Date().getFullYear()}-${String(seq.n).padStart(5, '0')}`;
  const row = await one(`INSERT INTO claims (number, type, shipment_id, user_id, name, contact, message, due_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '21 days') RETURNING number, type, status, created_at, due_at`,
  [number, type, shipmentId, user?.id ?? null, name, contact, message]);
  await notifyAdmins({ kind: 'pqr', title: `Nueva PQR ${number}`, body: `${name}: ${message.slice(0, 100)}`, link: '/admin/soporte' });
  res.status(201).json(row);
}));

claimsRouter.get('/claims', auth(), h(async (req, res) => {
  const admin = req.user.role === 'admin';
  const rows = await many(`SELECT c.*, s.code AS shipment_code FROM claims c LEFT JOIN shipments s ON s.id = c.shipment_id
    ${admin ? '' : 'WHERE c.user_id = $1'} ORDER BY (c.status = 'cerrada'), c.due_at LIMIT 300`, admin ? [] : [req.user.id]);
  res.json(rows);
}));

claimsRouter.get('/claims/:number/status', h(async (req, res) => {
  const c = await one('SELECT number, type, status, response, created_at, due_at, responded_at FROM claims WHERE number=$1', [clean(req.params.number, 30)]);
  if (!c) throw notFound('Radicado no encontrado');
  res.json(c);
}));

claimsRouter.post('/admin/claims/:id/respond', auth('admin'), h(async (req, res) => {
  const response = clean(req.body?.response, 3000);
  if (response.length < 5) throw bad('Escribe la respuesta');
  const status = req.body?.close === false ? 'en_tramite' : 'cerrada';
  const r = await one('UPDATE claims SET response=$1, status=$2, responded_at=now() WHERE id=$3 RETURNING id, number, user_id', [response, status, req.params.id]);
  if (!r) throw notFound();
  await notifyUsers([r.user_id], { kind: 'pqr.respuesta', title: `Respondimos tu PQR ${r.number}`, body: response.slice(0, 160), link: '/pqr' });
  await audit(req.user.id, 'claim.respond', req.params.id, { status });
  res.json({ ok: true });
}));
