/**
 * CR-03: identificación del objeto con IA (solo en línea y con sesión).
 * Toma la imagen de la cámara AR, la reduce y la envía a la función «identify» de Supabase,
 * que consulta un modelo de visión. Sin conexión, la app sigue midiendo sin esta función.
 */
import { File } from 'expo-file-system';
import { supabase } from '../cloud/supabase';

export interface Identification {
  objeto: string;
  categoria: string;
  confianza: 'alta' | 'media' | 'baja';
  descripcion: string;
  consejo: string;
  /** Recuadro normalizado (0..1) del objeto en la imagen; ancho 0 si no hay. */
  caja: { x: number; y: number; ancho: number; alto: number };
}

const MAX_SIDE = 768; // px: suficiente para reconocer el objeto y mucho más liviano

async function toBase64(uri: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' }> {
  try {
    // Módulo nativo: requiere una development build reciente; si no existe se envía la imagen original.
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const r = await manipulateAsync(uri, [{ resize: { width: MAX_SIDE } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (r.base64) return { data: r.base64, mediaType: 'image/jpeg' };
  } catch { /* sin módulo nativo */ }
  const data = await new File(uri).base64();
  return { data, mediaType: uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

const ERRORS: Record<string, string> = {
  rate: 'Demasiadas consultas seguidas. Espera un momento.',
  refusal: 'La IA no pudo analizar esta imagen.',
  image: 'La imagen es demasiado grande.',
};

export async function identifyImage(uri: string): Promise<Identification> {
  if (!supabase) throw new Error('La nube no está configurada.');
  const { data: b64, mediaType } = await toBase64(uri);
  try { new File(uri).delete(); } catch { /* la captura es temporal */ }
  const { data, error } = await supabase.functions.invoke('identify', { body: { image: b64, mediaType } });
  if (error) {
    let code = '';
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? ''; } catch { /* sin cuerpo */ }
    throw new Error(ERRORS[code] ?? 'No se pudo identificar el objeto. Revisa tu conexión.');
  }
  return data as Identification;
}
