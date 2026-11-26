/**
 * Canales de salida de los avisos.
 * - WhatsApp: API oficial de WhatsApp Cloud (Meta). Requiere WHATSAPP_TOKEN, WHATSAPP_PHONE_ID y una
 *   plantilla aprobada (WHATSAPP_TEMPLATE, por defecto «dimensiona_estado»). Sin credenciales: modo simulado
 *   (el mensaje queda registrado y la tienda puede enviarlo con un toque desde la app).
 * - Correo: SMTP (el mismo de recuperar contraseña).
 * - Push: servicio de Expo (no necesita credenciales en el servidor; en Android el APK necesita FCM).
 */
import { mailEnabled, sendMail } from '../services/passwords.js';

const env = process.env;
export const whatsappEnabled = () => !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);

export const channelStatus = () => ({
  whatsapp: whatsappEnabled() ? 'real' : 'simulado',
  email: mailEnabled(),
  push: true,
  template: env.WHATSAPP_TEMPLATE || 'dimensiona_estado',
});

export async function sendWhatsApp(to, params) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: {
        name: env.WHATSAPP_TEMPLATE || 'dimensiona_estado',
        language: { code: env.WHATSAPP_LANG || 'es' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? `WhatsApp respondió ${r.status}`);
  return j?.messages?.[0]?.id ?? null;
}

export async function sendEmail(to, subject, text) {
  await sendMail(to, subject, text);
}

/** Envía mensajes push por Expo. Devuelve los tokens que ya no son válidos para borrarlos. */
export async function sendPush(messages) {
  if (!messages.length || env.NODE_ENV === 'test') return [];
  const invalid = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await r.json().catch(() => ({}));
    (j?.data ?? []).forEach((t, k) => {
      if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') invalid.push(chunk[k].to);
    });
  }
  return invalid;
}
