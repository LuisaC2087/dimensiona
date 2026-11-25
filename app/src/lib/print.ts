/** Abre un documento imprimible (rótulo o factura) con un enlace firmado de corta duración. */
import { Linking, Platform } from 'react-native';
import { api, getBaseUrl } from '../api/client';

export async function openDocument(doc: 'label' | 'invoice', id: string) {
  const { url } = await api.printLink(doc, id);
  const full = `${getBaseUrl() || (Platform.OS === 'web' ? globalThis.location?.origin ?? '' : '')}${url}`;
  if (Platform.OS === 'web') globalThis.open?.(full, '_blank', 'noopener');
  else await Linking.openURL(full);
}
