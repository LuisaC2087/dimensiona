/** Almacenamiento de la sesión: SecureStore en el teléfono, localStorage en la web. */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setItem(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value == null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch { /* modo privado: la sesión dura lo que la pestaña */ }
    return;
  }
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch { /* sin almacenamiento seguro: la sesión no persiste */ }
}
