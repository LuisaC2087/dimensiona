/** Bitácora de acciones sensibles (pagos, facturación, cambios de usuarios y tarifas). */
import { Router } from 'express';
import { auth, h } from '../auth.js';
import { many, query } from '../db.js';

export async function audit(userId, action, target = null, detail = null) {
  try {
    await query('INSERT INTO audit_log (user_id, action, target, detail) VALUES ($1,$2,$3,$4)', [userId ?? null, action, target, detail ? JSON.stringify(detail) : null]);
  } catch (e) {
    console.error('[audit]', e.message); // la bitácora nunca debe tumbar la operación
  }
}

export const auditRouter = Router();
auditRouter.get('/admin/audit', auth('admin'), h(async (_req, res) => {
  res.json(await many(`SELECT a.id, a.action, a.target, a.detail, a.created_at, u.email FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`));
}));
