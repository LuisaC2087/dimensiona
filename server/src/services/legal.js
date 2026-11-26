/**
 * Documentos legales: Términos y Condiciones y Política de Tratamiento de Datos (Ley 1581 de 2012).
 * Fuente única en /legal/*.md; los datos de la empresa vienen de variables de entorno.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { h, notFound } from '../auth.js';
import { ROOT } from '../config.js';

export const LEGAL_VERSION = '1.2';
const VERSION_DATE = '25 de noviembre de 2026';

const DOCS = {
  terminos: { file: 'terminos.md', title: 'Términos y Condiciones' },
  privacidad: { file: 'privacidad.md', title: 'Política de Tratamiento de Datos Personales' },
};

const env = process.env;
const VARS = {
  VERSION: LEGAL_VERSION,
  VERSION_DATE,
  COMPANY: env.LEGAL_COMPANY || '[Razón social del operador]',
  NIT: env.LEGAL_NIT || '[NIT]',
  ADDRESS: env.LEGAL_ADDRESS || '[Dirección y ciudad]',
  EMAIL: env.LEGAL_EMAIL || '[correo de contacto]',
  CITY: env.LEGAL_CITY || 'Bogotá D.C.',
};

export function legalMarkdown(doc) {
  const d = DOCS[doc];
  if (!d) return null;
  const raw = fs.readFileSync(path.join(ROOT, 'legal', d.file), 'utf8');
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => VARS[k] ?? `{{${k}}}`);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/«(.+?)»/g, '«$1»');

/** Markdown mínimo (títulos, párrafos, listas, negrita) → HTML. */
export function mdToHtml(md) {
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    let m;
    if (!t) { flush(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = /^-\s+(.*)$/.exec(t))) { if (list?.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\d+\.\s+(.*)$/.exec(t))) { if (list?.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flush();
    out.push(`<p>${inline(t)}</p>`);
  }
  flush();
  return out.join('\n');
}

function page(title, body) {
  return `<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · DIMENSIONA</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#F8F4EC;color:#141414;font:16px/1.65 'IBM Plex Sans',system-ui,sans-serif}
header{background:#141414;border-bottom:6px solid #D7261E;padding:14px 16px}header a{color:#F8F4EC;font:700 20px Oswald,sans-serif;text-decoration:none;letter-spacing:.04em}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
h1,h2{font-family:Oswald,'Arial Narrow',sans-serif;text-transform:uppercase;line-height:1.05}
h1{font-size:clamp(32px,8vw,48px);margin:8px 0 4px}h2{font-size:22px;margin-top:32px;border-left:10px solid #D7261E;padding-left:10px}
nav{display:flex;gap:16px;margin-top:40px;flex-wrap:wrap}nav a{color:#D7261E;font-weight:600}
</style></head><body><header><a href="/">◆ DIMENSIONA</a></header><main>${body}
<nav><a href="/terminos">Términos y Condiciones</a><a href="/privacidad">Tratamiento de datos</a><a href="/">Inicio</a></nav></main></body></html>`;
}

export const legalRouter = Router();
legalRouter.get('/api/legal/:doc', h(async (req, res) => {
  const md = legalMarkdown(req.params.doc);
  if (!md) throw notFound('Documento no encontrado');
  res.json({ doc: req.params.doc, title: DOCS[req.params.doc].title, version: LEGAL_VERSION, markdown: md });
}));
for (const doc of Object.keys(DOCS)) {
  legalRouter.get(`/${doc}`, (_req, res) => res.type('html').send(page(DOCS[doc].title, mdToHtml(legalMarkdown(doc)))));
}
