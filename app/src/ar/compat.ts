/** Compatibilidad con ARCore (Android). En otras plataformas: no soportado. */
import { NativeModules, Platform } from 'react-native';

export type ARSupport = 'supported' | 'unsupported' | 'needsInstall' | 'unknown';

export function mapAvailability(raw: string): ARSupport | 'transient' {
  const r = raw.toUpperCase();
  if (r === 'SUPPORTED' || r === 'SUPPORTED_INSTALLED') return 'supported';
  if (r === 'SUPPORTED_NOT_INSTALLED' || r === 'SUPPORTED_APK_TOO_OLD') return 'needsInstall';
  if (r.startsWith('UNSUPPORTED')) return 'unsupported';
  if (r.includes('TRANSIENT') || r.includes('CHECKING')) return 'transient';
  return 'unknown';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function checkARSupport(budgetMs = 1800): Promise<ARSupport> {
  if (Platform.OS !== 'android') return 'unsupported';
  const mod = NativeModules.VRTARSceneNavigatorModule;
  if (!mod?.isARSupportedOnDevice) return 'unknown';
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    const raw = await Promise.race([
      new Promise<string>((resolve) => mod.isARSupportedOnDevice((r: string) => resolve(String(r ?? 'UNKNOWN')))),
      sleep(budgetMs).then(() => 'UNKNOWN_TIMED_OUT'),
    ]);
    const m = mapAvailability(raw);
    if (m !== 'transient') return m;
    await sleep(200);
  }
  return 'unknown';
}

export async function requestCamera(): Promise<boolean> {
  const mod = NativeModules.VRTARSceneNavigatorModule;
  if (!mod?.requestRequiredPermissions) return true;
  try { const r = await mod.requestRequiredPermissions(['camera']); return !!r?.camera; } catch { return false; }
}
