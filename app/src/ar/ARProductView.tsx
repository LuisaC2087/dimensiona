/**
 * Capa AR (única que importa ViroReact / ARCore).
 * - Detecta planos horizontales (cara superior del producto, mesa, piso) y verticales.
 * - Informa el punto 3D bajo la retícula (centro de la pantalla) para medir por puntos.
 * - Dibuja: puntos y segmentos medidos, el producto seleccionado como caja 3D con cotas, y la
 *   caja de envío recomendada como una caja roja «fantasma» alrededor del producto.
 */
import { useEffect, useImperativeHandle, useRef, useSyncExternalStore, type Ref } from 'react';
import { View } from 'react-native';
import {
  ViroARPlane, ViroARScene, ViroARSceneNavigator, ViroMaterials, ViroNode, ViroPolygon, ViroPolyline, ViroQuad, ViroSphere,
  ViroTelemetry, ViroText, ViroARTrackingReasonConstants as Reason, ViroTrackingStateConstants as TS,
  type ViroAnchor, type ViroCameraARHitTest,
} from '@reactvision/react-viro';
import { minAreaRect, type Point2, type Point3, type SurfaceKind, type TrackingState } from '../lib/measure';
import type { ARCallbacks, ARDrawing, ARHandle, BoxGhost, ProductOverlay } from './types';

export * from './types';

ViroTelemetry.setEnabled(false); // privacidad: sin telemetría

ViroMaterials.createMaterials({
  dmPoint: { diffuseColor: '#D7261E', lightingModel: 'Constant' },
  dmLine: { diffuseColor: '#EFE6D3', lightingModel: 'Constant' },
  dmRed: { diffuseColor: '#D7261E', lightingModel: 'Constant' },
  dmDraft: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  dmSurface: { diffuseColor: '#EFE6D3', lightingModel: 'Constant' },
  dmFill: { diffuseColor: '#D7261E', lightingModel: 'Constant', blendMode: 'Alpha', cullMode: 'None' },
  dmPillRed: { diffuseColor: '#D7261E', lightingModel: 'Constant', cullMode: 'None' },
  dmPillInk: { diffuseColor: '#141414', lightingModel: 'Constant', cullMode: 'None' },
});

const v = (p: Point3): [number, number, number] => [p.x, p.y, p.z];
const p3 = (a: number[]): Point3 => ({ x: a[0], y: a[1], z: a[2] });
const PLANE_TYPES = new Set(['ExistingPlaneUsingExtent', 'ExistingPlane', 'EstimatedHorizontalPlane']);
const HIT_PRIORITY: Record<string, number> = { ExistingPlaneUsingExtent: 0, DepthPoint: 1, ExistingPlane: 2, EstimatedHorizontalPlane: 3, FeaturePoint: 4 };

function mapTracking(state: number): TrackingState {
  return state === TS.TRACKING_NORMAL ? 'good' : state === TS.TRACKING_LIMITED ? 'limited' : 'lost';
}
function mapCause(reason: number) {
  switch (reason) {
    case Reason.TRACKING_REASON_EXCESSIVE_MOTION: return 'motion' as const;
    case Reason.TRACKING_REASON_INSUFFICIENT_FEATURES: return 'features' as const;
    case Reason.TRACKING_REASON_INSUFFICIENT_LIGHT: return 'light' as const;
    default: return 'none' as const;
  }
}

/** El dibujo vive en un almacén: la escena se redibuja sin depender de viroAppProps. */
const drawingStore = (() => {
  let value: ARDrawing = { points: [], segments: [], draft: null };
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (d: ARDrawing) => { value = d; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
})();
const sceneRef: { current: any } = { current: null };

function MeasureScene(props: { arSceneNavigator: { viroAppProps: { callbacks: ARCallbacks } } }) {
  const drawing = useSyncExternalStore(drawingStore.subscribe, drawingStore.get);
  const callbacks = props.arSceneNavigator.viroAppProps.callbacks;
  const cb = useRef(callbacks);
  useEffect(() => { cb.current = callbacks; }, [callbacks]);

  const onHit = (e: ViroCameraARHitTest) => {
    const cam = p3(e.cameraOrientation.position as unknown as number[]);
    const results = [...e.hitTestResults].sort((a, b) => (HIT_PRIORITY[a.type] ?? 9) - (HIT_PRIORITY[b.type] ?? 9));
    const r = results[0];
    if (!r) return cb.current.onReticle(null);
    const pos = p3(r.transform.position as unknown as number[]);
    const surface: SurfaceKind = PLANE_TYPES.has(r.type) ? 'plane' : r.type === 'DepthPoint' ? 'depth' : 'featurePoint';
    cb.current.onReticle({ position: pos, surface, cameraDistanceM: Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z), cameraPosition: cam });
  };

  const onAnchor = (a: ViroAnchor) => {
    if (a.type !== 'plane' || !a.alignment) return;
    const kind = a.alignment === 'Vertical' ? 'wall' : a.alignment === 'HorizontalDownward' ? 'ceiling' : 'floor';
    const verts = (a.vertices ?? []).map((q) => ({ x: q[0], z: q[2] }));
    const w = a.width ?? 0, h = a.height ?? 0, c0 = { x: a.center?.[0] ?? 0, z: a.center?.[2] ?? 0 };
    const extent = [{ x: c0.x - w / 2, z: c0.z - h / 2 }, { x: c0.x + w / 2, z: c0.z - h / 2 }, { x: c0.x + w / 2, z: c0.z + h / 2 }, { x: c0.x - w / 2, z: c0.z + h / 2 }];
    const outline = verts.length >= 3 ? verts : extent;
    const r = minAreaRect(outline);
    cb.current.onPlane({
      id: a.anchorId, kind, y: a.position[1] + (a.center?.[1] ?? 0),
      cx: a.position[0] + (a.center?.[0] ?? 0), cz: a.position[2] + (a.center?.[2] ?? 0), lengthM: r.lengthM, widthM: r.widthM,
      pose: { position: a.position, rotation: a.rotation }, outline, rect: r.corners,
    });
  };

  return (
    <ViroARScene
      ref={(r) => { sceneRef.current = r; }}
      anchorDetectionTypes={['planesHorizontal', 'planesVertical']}
      onTrackingUpdated={(s, r) => cb.current.onTracking(mapTracking(s), mapCause(r))}
      onCameraARHitTest={onHit}
      onAnchorFound={onAnchor}
      onAnchorUpdated={onAnchor}
    >
      {drawing.points.map((p, i) => <ViroSphere key={`p${i}`} position={v(p)} radius={0.008} materials={['dmPoint']} />)}
      {drawing.segments.map(([a, b], i) => <ViroPolyline key={`s${i}`} points={[v(a), v(b)]} thickness={0.004} materials={['dmRed']} />)}
      {drawing.labels?.map((l, i) => <Pill key={`l${i}`} at={v(l.at)} text={l.text} />)}
      {drawing.surfaces?.map((sf) => sf.outline.length > 2 && (
        <ViroARPlane key={sf.id} anchorId={sf.id}>
          <ViroPolyline points={closed(sf.outline, 0.002)} thickness={0.0015} materials={['dmSurface']} />
        </ViroARPlane>
      ))}
      {drawing.product && <ProductBox o={drawing.product} ghost={drawing.ghost ?? null} />}
      {drawing.draft && <ViroSphere position={v(drawing.draft)} radius={0.006} materials={['dmDraft']} />}
    </ViroARScene>
  );
}

const LIFT = 0.003;
const l3 = (p: Point2, y = LIFT): [number, number, number] => [p.x, y, p.z];
const closed = (pts: Point2[], y = LIFT) => [...pts, pts[0]].map((p) => l3(p, y));
const mid = (a: Point2, b: Point2): Point2 => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
const lenOf = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);

const PILL_H = 0.035;
function Pill({ at, text, ink }: { at: [number, number, number]; text: string; ink?: boolean }) {
  const w = 0.025 + text.length * 0.015;
  return (
    <ViroNode position={at} transformBehaviors={['billboard']}>
      <ViroQuad width={w} height={PILL_H} materials={[ink ? 'dmPillInk' : 'dmPillRed']} />
      <ViroText text={text} position={[0, 0, 0.002]} scale={[0.08, 0.08, 0.08]} width={w * 12.5} height={PILL_H * 12.5}
        style={{ fontFamily: 'sans-serif-condensed', fontSize: 22, fontWeight: '700', color: '#EFE6D3', textAlign: 'center', textAlignVertical: 'center' }} />
    </ViroNode>
  );
}

/** Producto como caja 3D (cara superior detectada + caída a la superficie de apoyo) y caja sugerida. */
function ProductBox({ o, ghost }: { o: ProductOverlay; ghost: BoxGhost | null }) {
  const r = o.rect;
  if (r.length !== 4) return null;
  const longFirst = lenOf(r[0], r[1]) >= lenOf(r[1], r[2]);
  const [a, b, c] = longFirst ? [r[0], r[1], r[2]] : [r[1], r[2], r[3]];
  const center = mid(r[0], r[2]);
  const dy = o.drop?.dy ?? 0;

  // Caja fantasma: ejes del producto (u = lado largo, w = lado corto), base en la superficie de apoyo.
  let ghostEdges: [number, number, number][][] = [];
  if (ghost) {
    const ul = lenOf(a, b) || 1, wl = lenOf(b, c) || 1;
    const u = { x: (b.x - a.x) / ul, z: (b.z - a.z) / ul }, w = { x: (c.x - b.x) / wl, z: (c.z - b.z) / wl };
    const hl = ghost.lengthM / 2, hw = ghost.widthM / 2;
    const corner = (su: number, sw: number): Point2 => ({ x: center.x + u.x * hl * su + w.x * hw * sw, z: center.z + u.z * hl * su + w.z * hw * sw });
    const base = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const y0 = dy, y1 = dy + ghost.heightM;
    ghostEdges = [closed(base, y0), closed(base, y1), ...base.map((p) => [l3(p, y0), l3(p, y1)])];
  }

  return (
    <ViroARPlane anchorId={o.planeId}>
      <ViroPolygon vertices={r.map((p) => [p.x, -p.z])} holes={[]} rotation={[-90, 0, 0]} position={[0, 0.002, 0]} materials={['dmFill']} opacity={0.3} />
      <ViroPolyline points={closed(r)} thickness={0.005} materials={['dmLine']} />
      {o.drop && (
        <>
          <ViroPolyline points={closed(r, dy)} thickness={0.004} materials={['dmLine']} />
          {r.map((p, i) => <ViroPolyline key={'v' + i} points={[l3(p, 0), l3(p, dy)]} thickness={0.004} materials={['dmLine']} />)}
          <Pill at={l3(a, dy / 2)} text={o.drop.label} ink />
        </>
      )}
      <Pill at={l3(mid(a, b), 0.03)} text={o.lengthLabel} ink />
      <Pill at={l3(mid(b, c), 0.03)} text={o.widthLabel} ink />
      {ghostEdges.map((pts, i) => <ViroPolyline key={'g' + i} points={pts} thickness={0.006} materials={['dmRed']} />)}
      {ghost && <Pill at={l3(center, dy + ghost.heightM + 0.05)} text={ghost.label} />}
    </ViroARPlane>
  );
}

export function ARProductView(props: { callbacks: ARCallbacks; drawing: ARDrawing; handleRef: Ref<ARHandle>; resetSignal: number }) {
  const nav = useRef<any>(null);
  useEffect(() => { drawingStore.set(props.drawing); }, [props.drawing]);
  useImperativeHandle(props.handleRef, () => ({
      capture: async () => {
        const n = nav.current;
        const take = n?.arSceneNavigator?.takeScreenshot ?? n?._takeScreenshot;
        if (!take) return null;
        const r = await take(`dimensiona_${Date.now()}`, false);
        if (!r?.success || !r.url) return null;
        return String(r.url).startsWith('file://') ? r.url : `file://${r.url}`;
      },
      hitTest: async (x: number, y: number) => {
        try {
          const res: any[] = (await sceneRef.current?.performARHitTestWithPoint?.(x, y)) ?? [];
          const best = [...res].sort((a, b) => (HIT_PRIORITY[a.type] ?? 9) - (HIT_PRIORITY[b.type] ?? 9))[0];
          return best ? p3(best.transform.position) : null;
        } catch { return null; }
      },
  }), []);
  useEffect(() => {
    if (props.resetSignal <= 0) return;
    nav.current?.arSceneNavigator?.resetARSession?.(true, false);
    nav.current?._resetARSession?.(true, false);
  }, [props.resetSignal]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ViroARSceneNavigator
        ref={nav}
        autofocus
        depthEnabled
        initialScene={{ scene: MeasureScene as any }}
        viroAppProps={{ callbacks: props.callbacks }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

