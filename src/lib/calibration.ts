/** RF-12: objetos de referencia predefinidos (metros). */
export const REFERENCES = [
  { id: 'card', label: 'Tarjeta bancaria', lengthM: 0.0856 },
  { id: 'letter', label: 'Hoja carta', lengthM: 0.2794 },
  { id: 'a4', label: 'Hoja A4', lengthM: 0.297 },
  { id: 'tape', label: 'Cinta 1 m', lengthM: 1.0 },
] as const;

export const K_MIN = 0.85;
export const K_MAX = 1.15;

export function calibrationFactor(realM: number, measuredM: number): number {
  if (!(realM > 0) || !(measuredM > 0)) throw new Error('Las longitudes deben ser positivas');
  return realM / measuredM;
}

export function isFactorAcceptable(k: number): boolean {
  return k >= K_MIN && k <= K_MAX;
}
