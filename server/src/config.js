import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const env = process.env;
if (!env.JWT_SECRET && env.NODE_ENV === 'production') {
  console.warn('[config] JWT_SECRET no definido: se genera uno temporal (las sesiones se pierden al reiniciar).');
}

export const config = {
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? '',
  pgliteDir: env.PGLITE_DIR ?? path.join(ROOT, 'data'),
  jwtSecret: env.JWT_SECRET || randomBytes(32).toString('hex'),
  adminEmail: (env.ADMIN_EMAIL ?? 'admin@dimensiona.app').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD ?? '',
  seedDemo: (env.SEED_DEMO ?? 'true') !== 'false',
  geminiKey: env.GEMINI_API_KEY ?? '',
  geminiModel: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  apkUrl: env.APK_URL ?? '',
  appVersion: env.APP_VERSION ?? '1.0.0',
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT ?? 4000}`).replace(/\/$/, ''),
  webDist: env.WEB_DIST ?? path.resolve(ROOT, '..', 'app', 'dist'),
};
