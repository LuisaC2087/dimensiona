/** Ayudante de pruebas: levanta el servidor real con una base PGlite temporal. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startServer(extraEnv = {}) {
  const port = 4800 + Math.floor(Math.random() * 900);
  const base = `http://127.0.0.1:${port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-test-'));
  const proc = spawn(process.execPath, ['src/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(port), PGLITE_DIR: dir, DATABASE_URL: '', JWT_SECRET: 'test-secret', ADMIN_PASSWORD: 'admin-test-1',
      SEED_DEMO: 'true', GEMINI_API_KEY: '', SMTP_HOST: '', NODE_ENV: 'test', APK_URL: 'https://example.com/app.apk', LEGAL_COMPANY: 'Empresa de Prueba SAS', ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 119) throw new Error(`El servidor no arrancó:\n${log}`);
  }
  async function call(method, p, { token, body } = {}) {
    const r = await fetch(`${base}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: r.status, body: json, headers: r.headers };
  }
  const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).body.token;
  const stop = () => { proc.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows */ } };
  return { base, call, login, stop, log: () => log };
}
