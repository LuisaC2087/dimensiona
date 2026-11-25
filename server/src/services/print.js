/**
 * Documentos imprimibles: rótulo de envío (10 × 15 cm con QR) y factura.
 * La app pide un enlace firmado (10 min) y lo abre en el navegador para imprimir o guardar PDF.
 */
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { Router } from 'express';
import { auth, bad, h, HttpError, notFound } from '../auth.js';
import { config } from '../config.js';
import { one } from '../db.js';
import { invoiceOut } from './billing.js';
import { carrierInfo } from '../carriers/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n) => '$' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const date = (d) => new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Bogota' });

const PAGE = (title, css, body) => `<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}body{margin:0;background:#E4D8BE;font:14px/1.4 'IBM Plex Sans',Arial,sans-serif;color:#141414}
.bar{position:sticky;top:0;background:#141414;color:#EFE6D3;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between}
.bar button{background:#D7261E;color:#EFE6D3;border:0;font:700 16px Oswald,sans-serif;text-transform:uppercase;padding:10px 18px;cursor:pointer}
h1,h2,.d{font-family:Oswald,'Arial Narrow',sans-serif;text-transform:uppercase;margin:0}
@media print{.bar{display:none}body{background:#fff}}${css}</style></head>
<body><div class="bar"><span>DIMENSIONA · ${esc(title)}</span><button onclick="window.print()">Imprimir / PDF</button></div>${body}</body></html>`;

async function labelHtml(s) {
  const pk = parse(s.packages) ?? [];
  const quote = parse(s.quote) ?? {};
  const qr = await QRCode.toDataURL(`${config.publicUrl}/rastreo/${s.code}`, { margin: 0, width: 260, color: { dark: '#141414', light: '#FFFFFF' } });
  const fragile = (parse(s.items) ?? []).some((i) => i.fragile);
  const carrier = carrierInfo(s.carrier);
  const css = `.label{width:10cm;min-height:15cm;margin:16px auto;background:#fff;border:3px solid #141414;display:flex;flex-direction:column}
.row{border-bottom:3px solid #141414;padding:8px 10px}.k{font:500 10px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#5B5750}
.big{font:700 26px Oswald,sans-serif;letter-spacing:2px}.head{display:flex;justify-content:space-between;align-items:center;background:#141414;color:#fff}
.head img{height:26px}.flex{display:flex;gap:10px;align-items:center}.qr img{width:3.2cm;height:3.2cm;display:block}
.tag{display:inline-block;background:#D7261E;color:#fff;font:700 13px Oswald,sans-serif;padding:2px 8px;text-transform:uppercase;margin:2px 4px 0 0}
@media print{@page{size:10cm 15cm;margin:0}.label{margin:0;border-width:2px}}`;
  const body = `<div class="label">
  <div class="row head"><img src="/brand/logo-horizontal-negativo.svg" alt="DIMENSIONA"><span class="d" style="font-size:15px">${esc(carrier.name)}</span></div>
  <div class="row flex"><div class="qr"><img src="${qr}" alt="QR de rastreo"></div><div>
    <div class="k">Guía DIMENSIONA</div><div class="big">${esc(s.code)}</div>
    ${s.carrier_guide ? `<div class="k" style="margin-top:6px">Guía ${esc(carrier.name)}</div><div class="d" style="font-size:18px">${esc(s.carrier_guide)}</div>` : ''}
    <div class="k" style="margin-top:6px">${esc(quote.serviceName ?? '')} · ${esc(s.zone)}</div></div></div>
  <div class="row"><div class="k">Destinatario</div><div class="d" style="font-size:20px">${esc(s.recipient_name)}</div>
    <div>${esc(s.address)}</div><div class="d" style="font-size:22px">${esc(s.city)}</div><div>Tel. ${esc(s.recipient_phone)}</div>${s.notes ? `<div><i>${esc(s.notes)}</i></div>` : ''}</div>
  <div class="row"><div class="k">Remitente</div><div><b>${esc(s.store_name)}</b> · ${esc(s.store_address ?? '')}, ${esc(s.store_city)}</div></div>
  <div class="row flex" style="justify-content:space-between"><div><div class="k">Paquetes</div><div class="d" style="font-size:20px">${pk.length}</div></div>
    <div><div class="k">Peso cobrable</div><div class="d" style="font-size:20px">${esc(quote.chargeableKg ?? '—')} kg</div></div>
    <div><div class="k">Caja</div><div class="d" style="font-size:16px">${esc(pk[0]?.box?.name ?? '')}</div></div></div>
  <div class="row" style="border-bottom:0">${Number(s.cod_amount) > 0 ? `<span class="tag">Contra entrega ${money(s.cod_amount)}</span>` : '<span class="tag" style="background:#141414">Pagado</span>'}${fragile ? '<span class="tag">Frágil ▲</span>' : ''}
    <div class="k" style="margin-top:6px">Creado ${date(s.created_at)} · Rastrea en ${esc(config.publicUrl.replace(/^https?:\/\//, ''))}/rastreo</div></div>
</div>`;
  return PAGE(`Rótulo ${s.code}`, css, body);
}

function invoiceHtml(inv) {
  const company = process.env.LEGAL_COMPANY || '[Razón social del operador]';
  const nit = process.env.LEGAL_NIT || '[NIT]';
  const css = `.doc{max-width:820px;margin:16px auto;background:#fff;border:3px solid #141414;padding:28px}
.top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:6px solid #D7261E;padding-bottom:16px}
.top img{height:44px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:7px 8px;border-bottom:1px solid #D8CAA9;text-align:left}
th{font:500 12px Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;background:#141414;color:#EFE6D3}td.n,th.n{text-align:right}
.tot{margin-left:auto;width:280px;margin-top:14px}.tot div{display:flex;justify-content:space-between;padding:4px 0}
.tot .g{font:700 22px Oswald,sans-serif;border-top:3px solid #141414;padding-top:8px}
.st{display:inline-block;padding:3px 10px;font:700 14px Oswald,sans-serif;text-transform:uppercase;color:#fff;background:${inv.status === 'pagada' ? '#1F7A3A' : inv.status === 'anulada' ? '#5B5750' : '#D7261E'}}
.note{margin-top:22px;font-size:12px;color:#5B5750}`;
  const rows = inv.items.map((i) => `<tr><td>${date(i.date)}</td><td>${esc(i.code)}</td><td>${esc(i.service ?? '')}</td><td>${esc(i.city)}</td><td class="n">${money(i.total)}</td></tr>`).join('');
  const body = `<div class="doc"><div class="top"><div><img src="/brand/logo-horizontal.svg" alt="DIMENSIONA"><div style="margin-top:8px">${esc(company)} · NIT ${esc(nit)}</div></div>
  <div style="text-align:right"><h1 style="font-size:28px">Cuenta de cobro</h1><div class="d" style="font-size:20px">${esc(inv.number)}</div><span class="st">${esc(inv.status)}</span></div></div>
  <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:16px"><div><div class="d" style="font-size:12px;color:#5B5750">Cliente</div><b>${esc(inv.store_name)}</b><br>${esc(inv.store_address ?? '')} ${esc(inv.store_city ?? '')}<br>${esc(inv.store_email ?? '')}</div>
  <div style="text-align:right"><div>Periodo: <b>${esc(inv.period)}</b></div><div>Emitida: ${date(inv.issued_at)}</div><div>Vence: ${date(inv.due_at)}</div>${inv.paid_at ? `<div>Pagada: ${date(inv.paid_at)}${inv.payment_ref ? ` · Ref. ${esc(inv.payment_ref)}` : ''}</div>` : ''}</div></div>
  <table><thead><tr><th>Fecha</th><th>Guía</th><th>Servicio</th><th>Destino</th><th class="n">Valor</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="tot"><div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div><div><span>IVA</span><span>${money(inv.iva)}</span></div><div class="g"><span>Total</span><span>${money(inv.total)}</span></div></div>
  <p class="note">Documento de cobro generado por DIMENSIONA. No reemplaza la factura electrónica de venta, que se emite a través del proveedor tecnológico autorizado por la DIAN.</p></div>`;
  return PAGE(`Factura ${inv.number}`, css, body);
}

export const printApiRouter = Router();
/** Enlace firmado para abrir un documento sin exponer el token de sesión. */
printApiRouter.post('/print-links', auth(), h(async (req, res) => {
  const { doc, id } = req.body ?? {};
  if (!['label', 'invoice'].includes(doc) || typeof id !== 'string') throw bad('Documento inválido');
  if (doc === 'label') {
    const s = await one('SELECT s.store_id, s.courier_id FROM shipments s WHERE s.id=$1', [id]);
    if (!s) throw notFound();
    const ok = req.user.role === 'admin' || (req.user.role === 'tienda' && req.store?.id === s.store_id) || (req.user.role === 'mensajero' && s.courier_id === req.user.id);
    if (!ok) throw notFound();
  } else {
    const inv = await one('SELECT store_id FROM invoices WHERE id=$1', [id]);
    if (!inv || (req.user.role !== 'admin' && req.store?.id !== inv.store_id)) throw notFound();
  }
  const t = jwt.sign({ doc, id }, config.jwtSecret, { expiresIn: '10m' });
  res.json({ url: `/imprimir/${doc}/${id}?t=${t}` });
}));

export const printPageRouter = Router();
printPageRouter.get('/imprimir/:doc/:id', h(async (req, res) => {
  let p;
  try { p = jwt.verify(String(req.query.t ?? ''), config.jwtSecret); } catch { throw new HttpError(401, 'Enlace vencido: vuelve a abrirlo desde la app'); }
  if (p.doc !== req.params.doc || p.id !== req.params.id) throw new HttpError(401, 'Enlace inválido');
  if (p.doc === 'label') {
    const s = await one(`SELECT s.*, st.name AS store_name, st.address AS store_address, st.city AS store_city FROM shipments s JOIN stores st ON st.id = s.store_id WHERE s.id=$1`, [p.id]);
    if (!s) throw notFound();
    return res.type('html').send(await labelHtml(s));
  }
  const inv = invoiceOut(await one(`SELECT i.*, s.name AS store_name, s.city AS store_city, s.address AS store_address, u.email AS store_email
    FROM invoices i JOIN stores s ON s.id = i.store_id JOIN users u ON u.id = s.owner_id WHERE i.id=$1`, [p.id]));
  if (!inv) throw notFound();
  res.type('html').send(invoiceHtml(inv));
}));
