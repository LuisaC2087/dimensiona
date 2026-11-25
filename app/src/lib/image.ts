/** Imágenes: reduce y convierte a base64 JPEG para enviarlas a la API (visión o evidencia). */
import { Platform } from 'react-native';

export async function toJpegBase64(uri: string, maxSide = 768, quality = 0.7): Promise<string> {
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const r = await manipulateAsync(uri, [{ resize: { width: maxSide } }], { compress: quality, format: SaveFormat.JPEG, base64: true });
    if (r.base64) return r.base64;
  } catch { /* sigue con el respaldo */ }
  if (Platform.OS === 'web') {
    if (uri.startsWith('data:')) return uri.split(',')[1] ?? '';
    const blob = await (await fetch(uri)).blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  const { File } = await import('expo-file-system');
  return await new File(uri).base64();
}
