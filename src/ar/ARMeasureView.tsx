/**
 * Capa AR (única que importa ViroReact). Expone al resto de la app un punto en la retícula
 * con los datos que necesita la confiabilidad (RF-03, RF-04, RF-09).
 */
import { useEffect, useRef } from 'react';
import {
  ViroARScene, ViroARSceneNavigator, ViroMaterials, ViroPolyline, ViroSphere, ViroTelemetry,
  ViroARTrackingReasonConstants as Reason, ViroTrackingStateConstants as TS,
  type ViroAnchor, type ViroCameraARHitTest,
} from '@reactvision/react-viro';
import type { Point3, SurfaceKind, TrackingState } from '../lib';

ViroTelemetry.setEnabled(false); // RNF-07: sin envío de datos

ViroMaterials.createMaterials({
  dimPoint: { diffuseColor: '#FFD100', lightingModel: 'Constant' },
  dimLine: { diffuseColor: '#FFD100', lightingModel: 'Constant' },
  dimDraft: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
});

export type TrackingCause = 'none' | 'motion' | 'features' | 'light';

/** Punto bajo la retícula (centro de pantalla). */
export interface ReticleHit {
  position: Point3;
  surface: SurfaceKind;
  cameraDistanceM: number;
  cameraPosition: Point3;
}

export interface ARCallbacks {
  onTracking: (state: TrackingState, cause: TrackingCause) => void;
  onReticle: (hit: ReticleHit | null) => void;
  onPlane: (id: string, orientation: 'horizontal' | 'vertical') => void;
}

export interface ARDrawing {
  points: Point3[];
  segments: [Point3, Point3][];
  draft: Point3 | null; // punto actual de la retícula
}

type AppProps = { callbacks: ARCallbacks; drawing: ARDrawing };

const v = (p: Point3): [number, number, number] => [p.x, p.y, p.z];
const p3 = (a: number[]): Point3 => ({ x: a[0], y: a[1], z: a[2] });

const PLANE_TYPES = new Set(['ExistingPlaneUsingExtent', 'ExistingPlane', 'EstimatedHorizontalPlane']);

function mapTracking(state: number): TrackingState {
  return state === TS.TRACKING_NORMAL ? 'good' : state === TS.TRACKING_LIMITED ? 'limited' : 'lost';
}
function mapCause(reason: number): TrackingCause {
  switch (reason) {
    case Reason.TRACKING_REASON_EXCESSIVE_MOTION: return 'motion';
    case Reason.TRACKING_REASON_INSUFFICIENT_FEATURES: return 'features';
    case Reason.TRACKING_REASON_INSUFFICIENT_LIGHT: return 'light';
    default: return 'none';
  }
}

function MeasureScene(props: { arSceneNavigator: { viroAppProps: AppProps } }) {
  const { callbacks, drawing } = props.arSceneNavigator.viroAppProps;
  const cb = useRef(callbacks);
  cb.current = callbacks;

  const onHit = (e: ViroCameraARHitTest) => {
    const cam = p3(e.cameraOrientation.position as unknown as number[]);
    // Preferir planos detectados sobre puntos de características (factor P).
    const results = [...e.hitTestResults].sort((a, b) => Number(PLANE_TYPES.has(b.type)) - Number(PLANE_TYPES.has(a.type)));
    const r = results[0];
    if (!r) return cb.current.onReticle(null);
    const pos = p3(r.transform.position as unknown as number[]);
    cb.current.onReticle({
      position: pos,
      surface: PLANE_TYPES.has(r.type) ? 'plane' : 'featurePoint',
      cameraDistanceM: Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z),
      cameraPosition: cam,
    });
  };

  const onAnchor = (a: ViroAnchor) => {
    if (a.type !== 'plane' || !a.alignment) return;
    cb.current.onPlane(a.anchorId, a.alignment === 'Vertical' ? 'vertical' : 'horizontal');
  };

  return (
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']}
      onTrackingUpdated={(s, r) => cb.current.onTracking(mapTracking(s), mapCause(r))}
      onCameraARHitTest={onHit}
      onAnchorFound={onAnchor}
    >
      {drawing.points.map((p, i) => <ViroSphere key={`p${i}`} position={v(p)} radius={0.015} materials={['dimPoint']} />)}
      {drawing.segments.map(([a, b], i) => <ViroPolyline key={`s${i}`} points={[v(a), v(b)]} thickness={0.006} materials={['dimLine']} />)}
      {drawing.draft && <ViroSphere position={v(drawing.draft)} radius={0.01} materials={['dimDraft']} />}
    </ViroARScene>
  );
}

export interface ARMeasureViewHandle { reset: () => void }

export function ARMeasureView(props: AppProps & { resetSignal: number }) {
  const nav = useRef<any>(null);
  useEffect(() => {
    if (props.resetSignal > 0) nav.current?.arSceneNavigator?.resetARSession?.(true, false);
    // Algunas versiones exponen el método directamente en la instancia.
    if (props.resetSignal > 0) nav.current?._resetARSession?.(true, false);
  }, [props.resetSignal]);
  return (
    <ViroARSceneNavigator
      ref={nav}
      autofocus
      initialScene={{ scene: MeasureScene as any }}
      viroAppProps={{ callbacks: props.callbacks, drawing: props.drawing }}
      style={{ flex: 1 }}
    />
  );
}
