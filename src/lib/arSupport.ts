/** Interpreta la respuesta de disponibilidad de ARCore (RF-01). */
export type ARSupport = 'supported' | 'unsupported' | 'needsInstall' | 'unknown';

export function mapAvailability(raw: string): ARSupport | 'transient' {
  const r = raw.toUpperCase();
  if (r === 'SUPPORTED' || r === 'SUPPORTED_INSTALLED') return 'supported';
  if (r === 'SUPPORTED_NOT_INSTALLED' || r === 'SUPPORTED_APK_TOO_OLD') return 'needsInstall';
  if (r.startsWith('UNSUPPORTED')) return 'unsupported';
  if (r.includes('TRANSIENT') || r.includes('CHECKING')) return 'transient';
  return 'unknown';
}
