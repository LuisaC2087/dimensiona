/** En la web no hay notificaciones push: los avisos se ven en la bandeja de la app. */
export type PushResult = 'ok' | 'denied' | 'unavailable';
export const pushSupported = false;
export async function registerPush(_ask = true): Promise<PushResult> { return 'unavailable'; }
export async function unregisterPush() { /* nada que limpiar */ }
export function useNotificationTaps() { /* sin push en la web */ }
