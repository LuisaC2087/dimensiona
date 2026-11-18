// Supabase Edge Function «identify» (CR-03): recibe una imagen de la cámara y devuelve todos los
// objetos y superficies con su recuadro. Usa Google Gemini (plan gratuito).
// La clave vive solo aquí (secreto GEMINI_API_KEY), nunca en la app.
// Requiere sesión: Supabase verifica el JWT antes de ejecutar (verify_jwt por defecto).

const KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
const MAX_B64 = 6_000_000; // ~4,5 MB de imagen

const PROMPT = `Eres el sistema de visión de DIMENSIONA, una app que mide espacios interiores con realidad aumentada.
Ignora líneas, recuadros o etiquetas dibujados por la app sobre la foto.
Detecta TODOS los objetos y superficies visibles que una persona podría querer medir: muebles, electrodomésticos,
objetos sobre mesas (botellas, cajas, cintas, libros…), puertas, ventanas, paredes, piso, techo, mesas, repisas.
Máximo 12, primero los más grandes y nítidos. Para cada uno da "box_2d" = [ymin, xmin, ymax, xmax] normalizado 0-1000,
AJUSTADO al borde visible. Nombres cortos en español de Colombia. No describas personas ni leas documentos o pantallas.
Si no hay nada reconocible, devuelve una lista vacía.`;

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    required: ['nombre', 'categoria', 'confianza', 'box_2d'],
    properties: {
      nombre: { type: 'STRING' },
      categoria: { type: 'STRING', enum: ['objeto', 'mueble', 'electrodoméstico', 'puerta', 'ventana', 'pared', 'piso', 'techo', 'superficie'] },
      confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
      box_2d: { type: 'ARRAY', items: { type: 'NUMBER' } },
    },
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const clamp = (v: number) => Math.min(1, Math.max(0, v / 1000));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!KEY) return json({ error: 'nokey' }, 500);
  let image: string, mediaType: string;
  try {
    ({ image, mediaType } = await req.json());
  } catch {
    return json({ error: 'body' }, 400);
  }
  if (typeof image !== 'string' || !image || image.length > MAX_B64) return json({ error: 'image' }, 400);
  if (mediaType !== 'image/jpeg' && mediaType !== 'image/png') return json({ error: 'mediaType' }, 400);

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: image } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
      }),
    });
    if (r.status === 429) return json({ error: 'rate' }, 429);
    if (!r.ok) return json({ error: 'api', status: r.status }, 502);
    const out = await r.json();
    const text = out?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
    if (!text) return json({ error: 'refusal' }, 422);
    const list = JSON.parse(text) as { nombre: string; categoria: string; confianza: string; box_2d: number[] }[];
    const objetos = list
      .filter((o) => Array.isArray(o.box_2d) && o.box_2d.length === 4)
      .slice(0, 12)
      .map((o) => {
        const [y0, x0, y1, x1] = o.box_2d;
        return {
          nombre: o.nombre, categoria: o.categoria, confianza: o.confianza,
          caja: { x: clamp(x0), y: clamp(y0), ancho: clamp(x1) - clamp(x0), alto: clamp(y1) - clamp(y0) },
        };
      })
      .filter((o) => o.caja.ancho > 0 && o.caja.alto > 0);
    return json({ objetos });
  } catch {
    return json({ error: 'unknown' }, 500);
  }
});
