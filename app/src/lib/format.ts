/** Formatos para mostrar (es-CO). Lógica pura. */

export function money(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '−' : ''}$${s}`;
}

export function cm(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return `${r.toString().replace('.', ',')} cm`;
}

export function dims(l: number, w: number, h: number): string {
  const f = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  return `${f(l)} × ${f(w)} × ${f(h)} cm`;
}

export function kg(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;
}

export function eta(days: number | undefined): string {
  if (days == null) return '';
  if (days === 0) return 'Mismo día';
  if (days === 1) return '1 día hábil';
  return `${days} días hábiles`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => x.toString().padStart(2, '0');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const ZONE_LABEL: Record<string, string> = { local: 'Local', regional: 'Regional', nacional: 'Nacional' };

/** Número de WhatsApp colombiano en formato internacional (57…). */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `57${d}` : d;
}

export const METHOD_LABEL: Record<'ar' | 'foto' | 'ia' | 'manual', string> = { ar: 'Medido con AR', foto: 'Medido con foto', ia: 'Estimado por IA', manual: 'Manual' };

export const CLAIM_LABEL = { peticion: 'Petición', queja: 'Queja', reclamo: 'Reclamo', sugerencia: 'Sugerencia' } as const;
