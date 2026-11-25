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
import { initDb } from './db.js';
import { seed } from './seed.js';
import { catalogRouter } from './services/catalog.js';
import { logisticsRouter } from './services/logistics.js';
import { shipmentsRouter } from './services/shipments.js';
import { usersRouter } from './services/users.js';
import { visionRouter } from './services/vision.js';
import { legalRouter } from './services/legal.js';

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

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use(legalRouter);

const api = express.Router();
api.get('/config', (_req, res) => res.json({
  apkUrl: config.apkUrl ? '/descargar' : null, version: config.appVersion, vision: !!config.geminiKey,
}));
api.use(usersRouter, catalogRouter, logisticsRouter, shipmentsRouter, visionRouter);
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

app.use(express.static(path.join(ROOT, 'public'), { maxAge: '10m' }));
app.get(/^\/rastreo(\/.*)?$/, (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

// Errores
app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err.type === 'entity.too.large' ? 413 : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Error interno del servidor' : err.message });
});

const kind = await initDb();
await seed();
app.listen(config.port, () => console.log(`DIMENSIONA escuchando en :${config.port} (base: ${kind})`));
