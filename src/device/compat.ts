/**
 * RF-01: verifica compatibilidad con ARCore y permiso de cámara.
 * La app decide en tiempo de ejecución; no se asume ningún modelo de teléfono.
 */
import { Linking, NativeModules, Platform } from 'react-native';

import { mapAvailability, type ARSupport } from '../lib/arSupport';
export type { ARSupport };

export type CameraPermission = 'granted' | 'denied' | 'unknown';

export interface CompatResult {
  ar: ARSupport;
  camera: CameraPermission;
  canScan: boolean;
  checkedInMs: number;
}

type NativeCheck = (cb: (result: string) => void) => void;

function nativeArCheck(): NativeCheck | null {
  const mod = NativeModules.VRTARSceneNavigatorModule;
  return mod?.isARSupportedOnDevice ? (cb) => mod.isARSupportedOnDevice(cb) : null;
}

function rawAvailability(check: NativeCheck): Promise<string> {
  return new Promise((resolve) => check((r) => resolve(String(r ?? 'UNKNOWN'))));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Consulta ARCore reintentando mientras esté en estado transitorio; límite total ~1,8 s (criterio ≤ 2 s). */
export async function checkARSupport(budgetMs = 1800): Promise<ARSupport> {
  if (Platform.OS !== 'android') return 'unsupported';
  const check = nativeArCheck();
  if (!check) return 'unknown';
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    const remaining = budgetMs - (Date.now() - start);
    const raw = await Promise.race([rawAvailability(check), sleep(remaining).then(() => 'UNKNOWN_TIMED_OUT')]);
    const mapped = mapAvailability(raw);
    if (mapped !== 'transient') return mapped;
    await sleep(200);
  }
  return 'unknown';
}

export async function checkCameraPermission(): Promise<CameraPermission> {
  const mod = NativeModules.VRTARSceneNavigatorModule;
  if (!mod?.checkPermissions) return 'unknown';
  try {
    const r = await mod.checkPermissions(['camera']);
    return r?.camera ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

export async function requestCameraPermission(): Promise<CameraPermission> {
  const mod = NativeModules.VRTARSceneNavigatorModule;
  if (!mod?.requestRequiredPermissions) return 'unknown';
  try {
    const r = await mod.requestRequiredPermissions(['camera']);
    return r?.camera ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

export async function checkCompatibility(): Promise<CompatResult> {
  const t0 = Date.now();
  const [ar, camera] = await Promise.all([checkARSupport(), checkCameraPermission()]);
  return { ar, camera, canScan: ar === 'supported' && camera === 'granted', checkedInMs: Date.now() - t0 };
}

/** Abre Google Play en la ficha de Servicios de Google Play para AR (requiere Internet la primera vez). */
export async function openARCoreInStore(): Promise<boolean> {
  const id = 'com.google.ar.core';
  try {
    await Linking.openURL(`market://details?id=${id}`);
    return true;
  } catch {
    try {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`);
      return true;
    } catch {
      return false;
    }
  }
}

export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}

/** Textos para la persona usuaria (sin lenguaje técnico, con acción sugerida). */
export const AR_MESSAGES: Record<ARSupport, { title: string; body: string }> = {
  supported: { title: 'Compatible', body: 'Tu teléfono soporta realidad aumentada. Ya puedes escanear.' },
  unsupported: {
    title: 'No compatible',
    body: 'Este teléfono no soporta la realidad aumentada que necesita DIMENSIONA para medir. Puedes ver la demostración y tus proyectos guardados.',
  },
  needsInstall: {
    title: 'Falta un componente',
    body: 'Tu teléfono es compatible, pero necesita instalar o actualizar «Servicios de Google Play para AR». Requiere Internet solo esta vez.',
  },
  unknown: {
    title: 'No se pudo verificar',
    body: 'No logramos confirmar la compatibilidad. Si usas Expo Go, la realidad aumentada no está disponible: instala la versión de DIMENSIONA. Si no, revisa tu conexión e intenta de nuevo.',
  },
};
