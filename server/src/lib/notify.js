/**
 * Textos de los avisos (lógica pura, sin E/S).
 * - Al destinatario (cliente final): WhatsApp o correo en los momentos que le importan.
 * - A la tienda, al mensajero y a administración: avisos dentro de la app y push.
 */

/** Estados en los que se avisa al destinatario. */
export const CUSTOMER_STATUSES = ['creado', 'en_ruta', 'entregado', 'novedad', 'devuelto'];

const CUSTOMER_PHRASE = {
  creado: 'ya está listo para salir',
  en_ruta: 'va en camino a tu dirección',
  entregado: 'fue entregado. ¡Gracias por tu compra!',
  novedad: 'tuvo una novedad en la entrega',
  devuelto: 'no pudo entregarse y regresó a la tienda',
};

export const firstName = (n) => String(n ?? '').trim().split(/\s+/)[0] || 'cliente';

/**
 * Celular colombiano o internacional → formato E.164 sin «+» (lo que piden WhatsApp y wa.me).
 * 3001234567 → 573001234567. Devuelve null si no parece un celular.
 */
export function normalizePhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return '57' + d;
  if (/^573\d{9}$/.test(d)) return d;
  if (String(raw ?? '').trim().startsWith('+') && d.length >= 10 && d.length <= 15) return d;
  return null;
}

/**
 * Mensaje al destinatario. `params` sigue el orden de la plantilla de WhatsApp
 * «dimensiona_estado»: Hola {{1}}, tu pedido de {{2}} {{3}}. Guía {{4}}. Síguelo aquí: {{5}}
 */
export function customerMessage(status, { name, store, code, link, note } = {}) {
  const phrase = CUSTOMER_PHRASE[status];
  if (!phrase) return null;
  const detail = status === 'novedad' && note ? ` (${String(note).slice(0, 80)})` : '';
  const params = [firstName(name), store || 'tu tienda', phrase + detail, code, link];
  const text = `Hola ${params[0]}, tu pedido de ${params[1]} ${params[2]}. Guía ${params[3]}. Síguelo aquí: ${params[4]}`;
  return { params, text };
}

/** Aviso a la tienda cuando su envío cambia de estado. */
export function storeNotice(status, { code, recipient, courier, receiver, note, carrier } = {}) {
  const who = firstName(recipient);
  switch (status) {
    case 'asignado': return { title: 'Mensajero asignado', body: `${code} · ${courier ? firstName(courier) : 'Un mensajero'} recogerá el paquete para ${who}.` };
    case 'recogido': return { title: 'Paquete recogido', body: `${code} · ${carrier ? `${carrier} recogió` : 'Recogimos'} el paquete para ${who}.` };
    case 'en_ruta': return { title: 'En ruta', body: `${code} · El paquete va camino a ${who}.` };
    case 'entregado': return { title: 'Entregado ✓', body: `${code} · Lo recibió ${receiver ? firstName(receiver) : who}.` };
    case 'novedad': return { title: 'Novedad en la entrega', body: `${code} · ${note ? String(note).slice(0, 120) : 'Revisa el detalle del envío.'}` };
    case 'devuelto': return { title: 'Envío devuelto', body: `${code} · El paquete para ${who} regresa a tu tienda.` };
    case 'cancelado': return { title: 'Envío cancelado', body: `${code} · Administración canceló el envío para ${who}.` };
    default: return null;
  }
}
