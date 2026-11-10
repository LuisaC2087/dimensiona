import type { Unit } from './types';

export const M_PER_IN = 0.0254;
export const M_PER_FT = 0.3048;

export function fromMeters(m: number, unit: Exclude<Unit, 'ft-in'>): number {
  switch (unit) {
    case 'm':
      return m;
    case 'cm':
      return m * 100;
    case 'in':
      return m / M_PER_IN;
  }
}

export function toFeet(m: number): number {
  return m / M_PER_FT;
}

function fmt(n: number, decimals: number): string {
  return n.toFixed(decimals).replace('.', ',');
}

/** Formatea una longitud para la UI (es-CO, coma decimal). Internamente siempre metros (RF-15). */
export function formatLength(m: number, unit: Unit, decimals = 2): string {
  if (unit === 'ft-in') {
    const totalIn = m / M_PER_IN;
    let ft = Math.floor(totalIn / 12);
    let inch = Math.round(totalIn - ft * 12);
    if (inch === 12) {
      ft += 1;
      inch = 0;
    }
    return `${ft} ft ${inch} in`;
  }
  const d = unit === 'cm' ? Math.max(0, decimals - 2) : decimals;
  return `${fmt(fromMeters(m, unit), d)} ${unit}`;
}

export function formatArea(m2: number, decimals = 2): string {
  return `${fmt(m2, decimals)} m²`;
}

export function formatVolume(m3: number, decimals = 2): string {
  return `${fmt(m3, decimals)} m³`;
}

/** Entrada manual: acepta coma o punto; null si no es numérico (RF-15). */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
