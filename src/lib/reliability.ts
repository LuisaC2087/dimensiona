import type { ReliabilityLevel, SurfaceKind, TrackingState } from './types';

/** Valores iniciales provisionales (Apéndice D); se ajustan en la fase 5. */
export const RELIABILITY_CONFIG = {
  weights: { T: 0.4, P: 0.3, D: 0.3 },
  tracking: { good: 1, limited: 0.5, lost: 0 } as Record<TrackingState, number>,
  surface: { plane: 1, featurePoint: 0.5 } as Record<SurfaceKind, number>,
  distance: { nearM: 2, farM: 5, atFar: 0.3, beyond: 0.2 },
  levels: { high: 75, medium: 50 },
};

export function distanceFactor(d: number, c = RELIABILITY_CONFIG.distance): number {
  if (d <= c.nearM) return 1;
  if (d <= c.farM) return 1 - ((d - c.nearM) / (c.farM - c.nearM)) * (1 - c.atFar);
  return c.beyond;
}

export interface ReliabilityInput {
  tracking?: TrackingState;
  surface?: SurfaceKind;
  cameraDistanceM?: number;
}

export interface Reliability {
  score: number; // 0..100
  level: ReliabilityLevel;
  partial: boolean;
  factors: { T?: number; P?: number; D?: number };
}

export function levelFor(score: number): ReliabilityLevel {
  const { high, medium } = RELIABILITY_CONFIG.levels;
  return score >= high ? 'Alta' : score >= medium ? 'Media' : 'Baja';
}

/** RF-09: S = 100·(0,40T + 0,30P + 0,30D), renormalizando pesos si falta algún factor. */
export function computeReliability(input: ReliabilityInput): Reliability {
  const cfg = RELIABILITY_CONFIG;
  const factors: Reliability['factors'] = {};
  if (input.tracking) factors.T = cfg.tracking[input.tracking];
  if (input.surface) factors.P = cfg.surface[input.surface];
  if (input.cameraDistanceM != null) factors.D = distanceFactor(input.cameraDistanceM);
  const keys = Object.keys(factors) as (keyof typeof cfg.weights)[];
  const wSum = keys.reduce((s, k) => s + cfg.weights[k], 0);
  const score =
    wSum === 0 ? 0 : (100 * keys.reduce((s, k) => s + cfg.weights[k] * factors[k]!, 0)) / wSum;
  return { score, level: levelFor(score), partial: keys.length < 3, factors };
}

/** Magnitudes derivadas: la menor puntuación de sus componentes (RF-09, paso 3). */
export function combineReliability(items: Reliability[]): Reliability {
  if (items.length === 0) throw new Error('combineReliability: sin componentes');
  return items.reduce((min, r) => (r.score < min.score ? r : min));
}

/** RF-13: porcentaje de incertidumbre por nivel (provisional). */
export const UNCERTAINTY_PCT: Record<ReliabilityLevel, number> = { Alta: 0.03, Media: 0.06, Baja: 0.12 };

export function uncertainty(value: number, level: ReliabilityLevel, pct = UNCERTAINTY_PCT): number {
  return Math.abs(value) * pct[level];
}
