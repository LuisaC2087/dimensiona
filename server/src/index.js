/**
 * DIMENSIONA Smart Logistics — servidor único para Render.
 *   /            página pública: descarga del APK y rastreo de guías
 *   /descargar   redirige al APK (APK_URL)
 *   /app         aplicación web (Expo exportado para web)
 *   /api/*       servicios: identidad, catálogo, embalaje/cotización, envíos, visión, administración
 */
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { HttpError } from './auth.js';
import { config, ROOT } from './config.js';
import { closeDb, initDb, one } from './db.js';
import { seed } from './seed.js';
import { catalogRouter } from './services/catalog.js';
import { logisticsRouter } from './services/logistics.js';
import { shipmentsRouter } from './services/shipments.js';
import { usersRouter } from './services/users.js';
import { visionRouter } from './services/vision.js';
import { legalRouter } from './services/legal.js';
import { billingRouter } from './services/billing.js';
import { auditRouter } from './services/audit.js';
import { printApiRouter, printPageRouter } from './services/print.js';
import { claimsRouter } from './services/claims.js';
import { passwordsRouter } from './services/passwords.js';
import { listCarriers } from './carriers/index.js';
import { mailEnabled } from './services/passwords.js';
import { notificationsRouter, pruneNotifications } from './services/notifications.js';
import { channelStatus } from './notify/channels.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
// Cabeceras de seguridad estándar
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use(cors());
app.use(express.json({ limit: '8mb' }));

// Registro de peticiones de la API (método, ruta sin parámetros sensibles, estado, duración)
app.use('/api', (req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    console.log(`${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
});

// Límite global por IP: 300 peticiones por minuto a la API
const hits = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now(), key = req.ip ?? 'x';
  const h = hits.get(key) ?? { n: 0, t: now };
  if (now - h.t > 60_000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(key, h);
  if (hits.size > 10_000) hits.clear();
  if (h.n > Number(process.env.RATE_LIMIT_PER_MIN ?? 300)) return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
  next();
});

app.get('/healthz', async (_req, res) => {
  try { await one('SELECT 1 AS ok'); res.json({ ok: true, db: true, version: config.appVersion }); }
  catch { res.status(503).json({ ok: false, db: false }); }
});
app.use(legalRouter);
app.use(printPageRouter);
app.get('/marca', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'marca.html')));

const api = express.Router();
api.get('/config', (_req, res) => res.json({
  apkUrl: config.apkUrl ? '/descargar' : null, version: config.appVersion, vision: !!config.geminiKey,
  mail: mailEnabled(), carriers: listCarriers(), notifications: channelStatus(),
}));
api.use(usersRouter, passwordsRouter, catalogRouter, logisticsRouter, shipmentsRouter, visionRouter, billingRouter, printApiRouter, claimsRouter, auditRouter, notificationsRouter);
api.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));
app.use('/api', api);

app.get('/descargar', (_req, res) => {
  if (!config.apkUrl) return res.status(503).send('El APK aún no está publicado. Vuelve pronto.');
  res.redirect(302, config.apkUrl);
});

// App web (Expo export). Rutas desconocidas bajo /app devuelven index.html (SPA).
if (fs.existsSync(config.webDist)) {
  app.use('/app', express.static(config.webDist, { maxAge: '1h', index: 'index.html' }));
  app.get(/^\/app(\/.*)?$/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
} else {
  app.get(/^\/app(\/.*)?$/, (_req, res) => res.status(503).send('La app web no está compilada (cd app && npx expo export -p web).'));
}

app.use(express.static(path.join(ROOT, 'public'), {
  maxAge: '10m',
  // Las páginas siempre se revalidan para que los cambios se vean al instante; imágenes y logos sí se guardan.
  setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get(/^\/rastreo(\/.*)?$/, (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

// Errores
app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err.type === 'entity.too.large' ? 413 : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Error interno del servidor' : err.message });
});

const kind = await initDb();
await seed();
await pruneNotifications();
const server = app.listen(config.port, () => console.log(`DIMENSIONA escuchando en :${config.port} (base: ${kind})`));

// Cierre ordenado (Render envía SIGTERM al redesplegar)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[${sig}] cerrando…`);
    server.close(async () => { try { await closeDb(); } finally { process.exit(0); } });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
