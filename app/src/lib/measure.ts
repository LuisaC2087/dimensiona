/**
 * Medición de productos (lógica pura, sin React ni Viro). Unidades internas: metros en AR,
 * centímetros hacia la API.
 */
export interface Point2 { x: number; z: number }
export interface Point3 { x: number; y: number; z: number }
export interface Px { x: number; y: number }
export type Dim = 'length' | 'width' | 'height';
export type TrackingState = 'good' | 'limited' | 'lost';
export type SurfaceKind = 'plane' | 'featurePoint' | 'depth';

export const MIN_SEPARATION_M = 0.01;

/** Rango de distancia cámara–producto en que la medición AR es confiable. */
export const MIN_DISTANCE_M = 0.3;
export const MAX_DISTANCE_M = 1.0;
export type DistanceStatus = 'cerca' | 'ok' | 'lejos';

/** Clasifica la distancia de la cámara al punto apuntado frente al rango permitido. */
export function distanceStatus(d: number): DistanceStatus {
  return d < MIN_DISTANCE_M ? 'cerca' : d > MAX_DISTANCE_M ? 'lejos' : 'ok';
}

export function distance3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function distance2(a: Px, b: Px): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  return n === 0 ? NaN : n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/** Rectángulo de área mínima que contiene los puntos (independiente de la rotación). Largo ≥ ancho. */
export function minAreaRect(pts: Point2[]): { lengthM: number; widthM: number; corners: Point2[] } {
  if (pts.length < 2) return { lengthM: 0, widthM: 0, corners: [] };
  let best = { area: Infinity, a: 0, b: 0, corners: [] as Point2[] };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const ang = Math.atan2(q.z - p.z, q.x - p.x);
    const c = Math.cos(ang), s = Math.sin(ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const r of pts) {
      const u = r.x * c + r.z * s, v = -r.x * s + r.z * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const a = maxU - minU, b = maxV - minV;
    if (a * b < best.area) {
      const back = (u: number, v: number): Point2 => ({ x: u * c - v * s, z: u * s + v * c });
      best = { area: a * b, a, b, corners: [back(minU, minV), back(maxU, minV), back(maxU, maxV), back(minU, maxV)] };
    }
  }
  return { lengthM: Math.max(best.a, best.b), widthM: Math.min(best.a, best.b), corners: best.corners };
}

/** Plano horizontal detectado por ARCore (cara superior del producto, mesa o piso). */
export interface HPlane { id: string; y: number; cx: number; cz: number; lengthM: number; widthM: number }

/**
 * Altura de un producto: distancia de su cara superior al plano horizontal de apoyo más alto
 * que esté debajo (mesa, repisa); si no hay, el piso. null si no hay plano de apoyo.
 */
export function heightAboveSupport(top: HPlane, planes: HPlane[], minGapM = 0.01): number | null {
  let base: number | null = null;
  for (const p of planes) {
    if (p.id === top.id || p.y > top.y - minGapM) continue;
    // el apoyo debe estar bajo el producto (centro dentro de su extensión, con margen)
    const reach = Math.hypot(p.lengthM, p.widthM) / 2 + 0.15;
    if (Math.hypot(top.cx - p.cx, top.cz - p.cz) > reach && p.lengthM < 3) continue;
    if (base == null || p.y > base) base = p.y;
  }
  return base == null ? null : top.y - base;
}

/** Confiabilidad 0..1 de una medida AR según seguimiento, tipo de superficie y distancia. */
export function reliability(tracking: TrackingState, surface: SurfaceKind, cameraDistanceM?: number): number {
  const t = tracking === 'good' ? 1 : tracking === 'limited' ? 0.6 : 0.2;
  const s = surface === 'plane' ? 1 : surface === 'depth' ? 0.85 : 0.65;
  const d = cameraDistanceM == null ? 0.85 : cameraDistanceM <= 0.8 ? 1 : cameraDistanceM <= 1.5 ? 0.85 : cameraDistanceM <= 3 ? 0.65 : 0.4;
  return Math.round(t * s * d * 100) / 100;
}

export function reliabilityLabel(score: number): 'Alta' | 'Media' | 'Baja' {
  return score >= 0.75 ? 'Alta' : score >= 0.5 ? 'Media' : 'Baja';
}

/** Metros → centímetros con 1 decimal. */
export const toCm = (m: number) => Math.round(m * 1000) / 10;

/**
 * Medida por foto con objeto de referencia: la escala se obtiene de dos toques sobre un objeto
 * de tamaño conocido que está en el mismo plano que el producto. La escala de pantalla se cancela.
 */
export function photoMeasureCm(refA: Px, refB: Px, refLengthCm: number, a: Px, b: Px): number | null {
  const refPx = distance2(refA, refB);
  if (!(refPx > 4) || !(refLengthCm > 0)) return null;
  const d = distance2(a, b);
  if (!(d > 0)) return null;
  return Math.round(((d / refPx) * refLengthCm) * 10) / 10;
}

export const REFERENCES = [
  { id: 'tarjeta', label: 'Tarjeta bancaria (lado largo)', cm: 8.56 },
  { id: 'carta', label: 'Hoja carta (lado largo)', cm: 27.94 },
  { id: 'billete', label: 'Billete colombiano (lado largo)', cm: 13.9 },
] as const;

/** Ordena largo ≥ ancho para guardar el producto de forma consistente. */
export function normalizeDims(d: { length: number; width: number; height: number }) {
  const [l, w] = [d.length, d.width].sort((a, b) => b - a);
  return { length: l, width: w, height: d.height };
}

/** Diferencia relativa entre dos juegos de medidas (para verificar al recoger). */
export function maxRelativeDiff(a: number[], b: number[]): number {
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y);
  let m = 0;
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) m = Math.max(m, Math.abs(sa[i] - sb[i]) / Math.max(sb[i], 1e-9));
  return m;
}

// ───────── Proyección isométrica para la vista 3D del embalaje ─────────
const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
/** x = largo, y = ancho, z = alto → coordenadas 2D. */
export function iso(p: { x: number; y: number; z: number }): { u: number; v: number } {
  return { u: (p.x - p.y) * C30, v: (p.x + p.y) * S30 - p.z };
}

/**
 * Base (centro de la cara inferior) de la caja estimada por la IA. La retícula suele tocar el frente del
 * producto a media altura: la caja se corre media profundidad lejos de la cámara y se apoya en el plano
 * horizontal de soporte que haya debajo. Sin soporte, se centra en altura sobre el punto tocado.
 */
export function aiBoxBase(
  hit: { x: number; y: number; z: number },
  camera: { x: number; y: number; z: number },
  planes: HPlane[],
  dims: { widthM: number; heightM: number },
): { x: number; y: number; z: number } {
  const dx = hit.x - camera.x, dz = hit.z - camera.z;
  const d = Math.hypot(dx, dz) || 1;
  const x = hit.x + (dx / d) * (dims.widthM / 2), z = hit.z + (dz / d) * (dims.widthM / 2);
  let support: number | null = null;
  for (const p of planes) {
    if (p.y > hit.y + 0.01) continue;
    if (Math.hypot(x - p.cx, z - p.cz) > Math.hypot(p.lengthM, p.widthM) / 2 + 0.15 && p.lengthM < 3) continue;
    if (support == null || p.y > support) support = p.y;
  }
  return { x, y: support ?? hit.y - dims.heightM / 2, z };
}
