/**
 * Servicio de visión: identifica productos en una foto de la cámara (Google Gemini, plan gratuito).
 * Devuelve nombre, categoría, si es frágil, recuadro en la imagen y una estimación de medidas
 * que la app usa solo como respaldo: la medida real la hace ARCore en el teléfono.
 * La clave vive solo en el servidor (GEMINI_API_KEY).
 */
import { Router } from 'express';
import { auth, bad, h, HttpError } from '../auth.js';
import { config } from '../config.js';

const MAX_B64 = 6_000_000;

const PROMPT = `Eres el sistema de visión de DIMENSIONA, una plataforma de envíos para pequeños negocios.
La foto viene de la cámara del teléfono de un emprendedor que va a empacar un producto para enviarlo.
Ignora líneas, puntos o etiquetas dibujadas por la app sobre la imagen.
Detecta los productos u objetos que se podrían enviar (máximo 6, primero el más centrado y nítido).
Para cada uno: nombre corto en español de Colombia, categoría, si es frágil, "box_2d" = [ymin, xmin, ymax, xmax]
normalizado 0-1000 ajustado al borde visible, y una estimación aproximada de largo, ancho y alto en centímetros
usando referencias visuales (no inventes precisión). No describas personas ni leas documentos o pantallas.
Si no hay nada reconocible, devuelve una lista vacía.`;

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    required: ['nombre', 'categoria', 'fragil', 'confianza', 'box_2d', 'largo_cm', 'ancho_cm', 'alto_cm'],
    properties: {
      nombre: { type: 'STRING' },
      categoria: { type: 'STRING', enum: ['Ropa', 'Calzado', 'Hogar', 'Belleza', 'Tecnología', 'Accesorios', 'Papelería', 'Alimentos', 'Juguetes', 'Otro'] },
      fragil: { type: 'BOOLEAN' },
      confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
      box_2d: { type: 'ARRAY', items: { type: 'NUMBER' } },
      largo_cm: { type: 'NUMBER' },
      ancho_cm: { type: 'NUMBER' },
      alto_cm: { type: 'NUMBER' },
    },
  },
};

const clamp = (v) => Math.min(1, Math.max(0, v / 1000));

// Cuota por usuario: máximo 20 consultas por minuto (protege el plan gratuito).
const usage = new Map();
function quota(userId) {
  const now = Date.now();
  const a = (usage.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (a.length >= 20) throw new HttpError(429, 'Muchas consultas seguidas; espera un momento.');
  a.push(now);
  usage.set(userId, a);
}

export const visionRouter = Router();

visionRouter.post('/vision/identify', auth(), h(async (req, res) => {
  if (!config.geminiKey) throw new HttpError(503, 'El reconocimiento con IA no está configurado en el servidor. Puedes medir igual con AR.');
  if (req.body?.consent !== true) throw bad('Debes autorizar el envío de la imagen al servicio de IA');
  quota(req.user.id);
  let { image, mediaType } = req.body ?? {};
  if (typeof image === 'string' && image.startsWith('data:')) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s.exec(image);
    if (m) { mediaType = m[1]; image = m[2]; }
  }
  if (typeof image !== 'string' || !image || image.length > MAX_B64) throw bad('Imagen inválida o muy grande');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw bad('Formato de imagen no soportado');

  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: image } }, { text: PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
  });
  // Modelo configurado y, si Google lo retiró (404), los alias vigentes de Flash.
  const models = [...new Set([config.geminiModel, 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  let r;
  for (const model of models) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey }, body,
      signal: AbortSignal.timeout(45_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.ok || r.status !== 404) break;
    console.error(`[vision] modelo ${model} no disponible (404)`);
  }
  if (r.status === 429) throw new HttpError(429, 'La IA está ocupada (límite gratuito). Intenta en unos segundos.');
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error(`[vision] Gemini respondió ${r.status}: ${String(detail).slice(0, 300)}`);
    throw new HttpError(502, 'El servicio de IA no respondió');
  }
  const out = await r.json();
  const text = out?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) return res.json({ objetos: [] });
  let list;
  try { list = JSON.parse(text); } catch { return res.json({ objetos: [] }); }
  const objetos = (Array.isArray(list) ? list : [])
    .filter((o) => Array.isArray(o.box_2d) && o.box_2d.length === 4)
    .slice(0, 6)
    .map((o) => {
      const [y0, x0, y1, x1] = o.box_2d;
      return {
        nombre: String(o.nombre).slice(0, 60), categoria: o.categoria, fragil: !!o.fragil, confianza: o.confianza,
        caja: { x: clamp(x0), y: clamp(y0), ancho: clamp(x1) - clamp(x0), alto: clamp(y1) - clamp(y0) },
        estimado: { largo: Number(o.largo_cm) || null, ancho: Number(o.ancho_cm) || null, alto: Number(o.alto_cm) || null },
      };
    })
    .filter((o) => o.caja.ancho > 0 && o.caja.alto > 0);
  res.json({ objetos });
}));
