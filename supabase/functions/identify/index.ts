// Supabase Edge Function «identify» (CR-03): recibe una imagen de la cámara y devuelve qué objeto es.
// La clave de Anthropic vive solo aquí (secreto ANTHROPIC_API_KEY), nunca en la app.
// Requiere sesión: Supabase verifica el JWT antes de ejecutar (verify_jwt por defecto).
import Anthropic from 'npm:@anthropic-ai/sdk';

const client = new Anthropic(); // lee ANTHROPIC_API_KEY
const MAX_B64 = 6_000_000; // ~4,5 MB de imagen

const SYSTEM = `Eres el asistente de visión de DIMENSIONA, una app que mide espacios interiores.
Recibes una foto de la cámara del teléfono; el centro de la imagen es donde apunta la persona
(puede haber líneas amarillas o blancas dibujadas por la app: ignóralas).
Identifica el objeto principal en el centro. Responde en español de Colombia, breve y concreto.
Si no puedes distinguir un objeto, usa objeto "No identificado" y confianza "baja".
No describas personas ni leas documentos, pantallas o datos personales que aparezcan.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['objeto', 'categoria', 'confianza', 'descripcion', 'consejo', 'caja'],
  properties: {
    objeto: { type: 'string', description: 'Nombre corto del objeto, p. ej. «Mesa de comedor»' },
    categoria: { type: 'string', enum: ['mueble', 'electrodoméstico', 'puerta', 'ventana', 'pared', 'piso', 'techo', 'decoración', 'otro'] },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    descripcion: { type: 'string', description: 'Una frase: material, color o forma' },
    consejo: { type: 'string', description: 'Una frase sobre cómo medirlo mejor con la app' },
    caja: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'ancho', 'alto'],
      description: 'Recuadro del objeto en la imagen, normalizado 0..1 desde la esquina superior izquierda. Todo 0 si no hay objeto.',
      properties: { x: { type: 'number' }, y: { type: 'number' }, ancho: { type: 'number' }, alto: { type: 'number' } },
    },
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let image: string, mediaType: string;
  try {
    ({ image, mediaType } = await req.json());
  } catch {
    return json({ error: 'body' }, 400);
  }
  if (typeof image !== 'string' || !image || image.length > MAX_B64) return json({ error: 'image' }, 400);
  if (mediaType !== 'image/jpeg' && mediaType !== 'image/png') return json({ error: 'mediaType' }, 400);

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: '¿Qué objeto hay en el centro de la imagen?' },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422);
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'empty' }, 502);
    return json(JSON.parse(text.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: 'api', status: e.status }, 502);
    return json({ error: 'unknown' }, 500);
  }
});
