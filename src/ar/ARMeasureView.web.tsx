/** Versión web (solo pruebas en navegador): no hay ARCore, se muestra un aviso. */
import { Text, View } from 'react-native';
import type { Point3, SurfaceKind, TrackingState } from '../lib';
import { colors } from '../theme';

export type TrackingCause = 'none' | 'motion' | 'features' | 'light';
export interface ReticleHit { position: Point3; surface: SurfaceKind; cameraDistanceM: number; cameraPosition: Point3 }
export interface ARCallbacks {
  onTracking: (state: TrackingState, cause: TrackingCause) => void;
  onReticle: (hit: ReticleHit | null) => void;
  onPlane: (id: string, orientation: 'horizontal' | 'vertical') => void;
}
export interface ARDrawing { points: Point3[]; segments: [Point3, Point3][]; draft: Point3 | null }

export function ARMeasureView(_props: { callbacks: ARCallbacks; drawing: ARDrawing; resetSignal: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>La realidad aumentada solo funciona en el teléfono.</Text>
    </View>
  );
}
