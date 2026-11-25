/**
 * Integración con transportadoras (Servientrega, Coordinadora) mediante adaptadores.
 *
 * Ninguna de las dos publica una API abierta: la integración directa requiere una cuenta
 * empresarial y la documentación/credenciales que entregan al firmar contrato. Por eso:
 *  - Modo «simulado» (por defecto): genera guías, programa recogidas y produce un rastreo que
 *    avanza con el tiempo, para operar y probar el flujo completo.
 *  - Modo «real»: se activa con las credenciales del contrato (variables *_USER, *_PASSWORD,
 *    *_API_URL). El cliente HTTP (`realRequest`) es el punto único donde se conectan las
 *    operaciones documentadas por la transportadora.
 */
import { createHash } from 'node:crypto';
import { HttpError } from '../auth.js';

const env = process.env;
const MIN_PER_STEP = Number(env.CARRIER_SIM_MINUTES_PER_STEP ?? 30);

const DEFS = {
  propia: { id: 'propia', name: 'Red DIMENSIONA', guidePrefix: 'DM', pickup: false },
  servientrega: { id: 'servientrega', name: 'Servientrega', guidePrefix: '2', guideLen: 10, pickup: true, envKey: 'SERVIENTREGA' },
  coordinadora: { id: 'coordinadora', name: 'Coordinadora', guidePrefix: '7', guideLen: 11, pickup: true, envKey: 'COORDINADORA' },
};

export const CARRIER_IDS = Object.keys(DEFS);

function credentials(def) {
  if (!def.envKey) return null;
  const user = env[`${def.envKey}_USER`], password = env[`${def.envKey}_PASSWORD`], url = env[`${def.envKey}_API_URL`];
  return user && password && url ? { user, password, url, account: env[`${def.envKey}_ACCOUNT`] ?? '' } : null;
}

export function carrierInfo(id) {
  const def = DEFS[id] ?? DEFS.propia;
  return { id: def.id, name: def.name, mode: def.id === 'propia' ? 'propia' : credentials(def) ? 'real' : 'simulado', pickup: def.pickup };
}
export const listCarriers = () => CARRIER_IDS.map(carrierInfo);

/** Número de guía determinístico a partir del código interno (simulado). */
function simGuide(def, code) {
  const digits = BigInt('0x' + createHash('sha1').update(def.id + code).digest('hex').slice(0, 15)).toString().padStart(def.guideLen, '0');
  return def.guidePrefix + digits.slice(0, def.guideLen - def.guidePrefix.length);
}

async function realRequest(def, operation, payload) {
  const c = credentials(def);
  if (!c) throw new HttpError(503, `${def.name} no está configurada`);
  // Las operaciones y el formato (REST/SOAP) los define el contrato de cada transportadora.
  // Se envían como JSON a `${API_URL}/${operation}` con autenticación básica; ajústalo a la
  // documentación entregada por la transportadora.
  const r = await fetch(`${c.url.replace(/\/$/, '')}/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${c.user}:${c.password}`).toString('base64') },
    body: JSON.stringify({ account: c.account, ...payload }),
  });
  if (!r.ok) throw new HttpError(502, `${def.name} respondió ${r.status}`);
  return r.json();
}

/** Crea la guía en la transportadora. */
export async function createGuide(carrier, { code, store, shipment }) {
  const def = DEFS[carrier];
  if (!def || carrier === 'propia') return null;
  if (credentials(def)) {
    const r = await realRequest(def, 'guias', {
      referencia: code,
      remitente: { nombre: store.name, ciudad: store.city, direccion: store.address, telefono: store.whatsapp },
      destinatario: { nombre: shipment.recipientName, telefono: shipment.recipientPhone, direccion: shipment.address, ciudad: shipment.city },
      paquetes: shipment.packages.map((p) => ({ largo: p.box.length, ancho: p.box.width, alto: p.box.height, peso: p.contentWeightKg })),
      valorDeclarado: shipment.declaredValue, valorRecaudo: shipment.codAmount,
    });
    return { guide: String(r.guia ?? r.numeroGuia ?? r.guide), mode: 'real' };
  }
  return { guide: simGuide(def, code), mode: 'simulado' };
}

/** Programa la recogida en el punto de la tienda. */
export async function schedulePickup(carrier, { guide, date, window, store }) {
  const def = DEFS[carrier];
  if (!def?.pickup) throw new HttpError(400, 'Este envío no usa transportadora con recogida programada');
  if (credentials(def)) {
    const r = await realRequest(def, 'recogidas', { guia: guide, fecha: date, franja: window, direccion: store.address, ciudad: store.city });
    return { id: String(r.recogida ?? r.id), date, window, mode: 'real' };
  }
  return { id: `REC-${guide.slice(-6)}`, date, window, mode: 'simulado' };
}

const SIM_FLOW = [
  { status: 'recogido', note: 'Recogido en el punto de la tienda' },
  { status: 'en_ruta', note: 'En centro de distribución de origen' },
  { status: 'en_ruta', note: 'En tránsito hacia la ciudad de destino' },
  { status: 'en_ruta', note: 'En reparto' },
  { status: 'entregado', note: 'Entregado al destinatario' },
];

/**
 * Rastreo en la transportadora. En simulado avanza un paso cada CARRIER_SIM_MINUTES_PER_STEP
 * minutos desde la recogida programada (o desde la creación).
 */
export async function track(carrier, { guide, since }) {
  const def = DEFS[carrier];
  if (!def || carrier === 'propia') return [];
  if (credentials(def)) {
    const r = await realRequest(def, 'rastreo', { guia: guide });
    return (r.eventos ?? []).map((e) => ({ status: e.estado, note: e.descripcion, at: e.fecha }));
  }
  const start = new Date(since).getTime();
  const steps = Math.min(SIM_FLOW.length, Math.floor((Date.now() - start) / (MIN_PER_STEP * 60_000)));
  return SIM_FLOW.slice(0, steps).map((s, i) => ({ ...s, note: `${def.name}: ${s.note}`, at: new Date(start + (i + 1) * MIN_PER_STEP * 60_000).toISOString() }));
}
