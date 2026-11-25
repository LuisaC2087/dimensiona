import type { Point2, Point3, SurfaceKind, TrackingState } from '../lib/measure';

export type TrackingCause = 'none' | 'motion' | 'features' | 'light';

export interface ReticleHit { position: Point3; surface: SurfaceKind; cameraDistanceM: number; cameraPosition: Point3 }

export interface DetectedPlane {
  id: string; kind: 'floor' | 'ceiling' | 'wall'; y: number;
  cx: number; cz: number; lengthM: number; widthM: number;
  pose: { position: [number, number, number]; rotation: [number, number, number] };
  outline: Point2[]; rect: Point2[];
}

export interface ARCallbacks {
  onTracking: (state: TrackingState, cause: TrackingCause) => void;
  onReticle: (hit: ReticleHit | null) => void;
  onPlane: (plane: DetectedPlane) => void;
}

export interface ProductOverlay {
  planeId: string; rect: Point2[]; lengthLabel: string; widthLabel: string;
  drop: { dy: number; label: string } | null;
}
export interface BoxGhost { lengthM: number; widthM: number; heightM: number; label: string }

export interface ARDrawing {
  points: Point3[];
  segments: [Point3, Point3][];
  labels?: { at: Point3; text: string }[];
  draft: Point3 | null;
  product?: ProductOverlay | null;
  ghost?: BoxGhost | null;
  surfaces?: { id: string; outline: Point2[] }[];
}

export interface ARHandle {
  capture: () => Promise<string | null>;
  hitTest: (x: number, y: number) => Promise<Point3 | null>;
}
