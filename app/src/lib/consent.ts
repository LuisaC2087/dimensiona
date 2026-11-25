/** Consentimiento para enviar imágenes al servicio de IA (se pide una vez y se puede revocar). */
import { Alert, Platform } from 'react-native';
import { getItem, setItem } from './storage';

const KEY = 'dm.aiConsent.v1';
const TEXT = 'Para reconocer el producto, la imagen de la cámara se enviará a un servicio de inteligencia artificial (Google Gemini). DIMENSIONA no la guarda. No enfoques personas, documentos ni pantallas. ¿Autorizas el envío? Puedes revocarlo en Cuenta.';

export async function hasAiConsent() { return (await getItem(KEY)) === 'si'; }
export async function revokeAiConsent() { await setItem(KEY, null); }

export async function ensureAiConsent(): Promise<boolean> {
  if (await hasAiConsent()) return true;
  const ok = await new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') { resolve(!!globalThis.confirm?.(`Reconocer con IA\n\n${TEXT}`)); return; }
    Alert.alert('Reconocer con IA', TEXT, [
      { text: 'No', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Autorizo', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
  if (ok) await setItem(KEY, 'si');
  return ok;
}
