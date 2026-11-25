/**
 * Canal entre la pantalla de medición y quien la abrió (formulario de producto o verificación
 * del mensajero). La pantalla de medición deja el resultado y vuelve; la anterior lo consume.
 */
export interface MeasureResult {
  length: number; width: number; height: number; // cm
  method: 'ar' | 'foto' | 'ia';
  confidence: number | null;
  name?: string; category?: string; fragile?: boolean;
  purpose?: string; // p. ej. «verify:<idEnvío>»
}

let pending: MeasureResult | null = null;
export const measureBus = {
  put(r: MeasureResult) { pending = r; },
  take(purpose?: string): MeasureResult | null {
    if (!pending) return null;
    if ((pending.purpose ?? '') !== (purpose ?? '')) return null;
    const r = pending;
    pending = null;
    return r;
  },
};
