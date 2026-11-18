/* eslint-disable react-hooks/refs, react-hooks/immutability -- puente con Viro: callbacks y refs nativos se actualizan en cada render a propósito */
/**
 * Capa AR (única que importa ViroReact). Expone al resto de la app un punto en la retícula
 * con los datos que necesita la confiabilidad (RF-03, RF-04, RF-09).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { NativeModules, View } from 'react-native';
import {
  ViroARPlane, ViroARScene, ViroARSceneNavigator, ViroMaterials, ViroNode, ViroPolygon, ViroPolyline, ViroQuad, ViroSphere,
  ViroObjectDetector, ViroTelemetry, ViroText,
  ViroARTrackingReasonConstants as Reason, ViroTrackingStateConstants as TS,
  type ViroAnchor, type ViroCameraARHitTest,
} from '@reactvision/react-viro';
import { minAreaRect, type Point2, type ScreenBox, type Point3, type SurfaceKind, type TrackingState } from '../lib';

ViroTelemetry.setEnabled(false); // RNF-07: sin envío de datos
// CR-04: con la nueva arquitectura de RN los módulos nativos se crean al primer uso desde JS.
// El proveedor ONNX se registra al crearse, así que hay que pedirlo explícitamente.
try { NativeModules.ViroONNX?.install?.(); } catch { /* sin módulo: el detector informa el error */ }

ViroMaterials.createMaterials({
  dimPoint: { diffuseColor: '#FFD100', lightingModel: 'Constant' },
  dimLine: { diffuseColor: '#FFD100', lightingModel: 'Constant' },
  dimDraft: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  dimSurface: { diffuseColor: '#4ADE80', lightingModel: 'Constant' },
  dimSurfaceFill: { diffuseColor: '#4ADE80', lightingModel: 'Constant', blendMode: 'Alpha', cullMode: 'None' },
  dimFill: { diffuseColor: '#FFD100', lightingModel: 'Constant', blendMode: 'Alpha', cullMode: 'None' },
  pillAccent: { diffuseColor: '#FFD100', lightingModel: 'Constant', cullMode: 'None' },
  pillInfo: { diffuseColor: '#4F46E5', lightingModel: 'Constant', cullMode: 'None' },
});

export type TrackingCause = 'none' | 'motion' | 'features' | 'light';

/** Punto bajo la retícula (centro de pantalla). */
export interface ReticleHit {
  position: Point3;
  surface: SurfaceKind;
  cameraDistanceM: number;
  cameraPosition: Point3;
}

/** Plano detectado por ARCore: «floor» = horizontal hacia arriba, «ceiling» = hacia abajo. y = altura del plano (m). */
export interface DetectedPlane {
  id: string; kind: 'floor' | 'ceiling' | 'wall'; y: number;
  /** Centro horizontal y tamaño del plano (largo ≥ ancho), para medir objetos. */
  cx: number; cz: number; lengthM: number; widthM: number;
  /** Pose del ancla y contorno en coordenadas locales del ancla (para dibujar el objeto en AR). */
  pose: { position: [number, number, number]; rotation: [number, number, number] };
  outline: Point2[];
  rect: Point2[];
}

/**
 * Superficie u objeto medido para dibujar en AR (estilo cinta métrica): rectángulo relleno sobre el plano,
 * cotas en cada lado, caja 3D hasta el piso si es un objeto, y etiquetas con área, perímetro y volumen.
 * Coordenadas locales del ancla (x, z), que ViroARPlane coloca y actualiza solo.
 */
export interface ARObjectOverlay {
  planeId: string;
  rect: Point2[];
  lengthLabel: string;
  widthLabel: string;
  /** Caída hasta el piso (m, negativa) y su etiqueta; null = superficie plana (piso, mesa sin piso detectado). */
  drop: { dy: number; label: string } | null;
  /** Etiquetas apiladas sobre el centro (nombre, S=, P=, V=). */
  info: string[];
}

export interface ARCallbacks {
  onTracking: (state: TrackingState, cause: TrackingCause) => void;
  onReticle: (hit: ReticleHit | null) => void;
  onPlane: (plane: DetectedPlane) => void;
}

export interface ARDrawing {
  points: Point3[];
  segments: [Point3, Point3][];
  draft: Point3 | null; // punto actual de la retícula
  object?: ARObjectOverlay | null;
  /** Contornos de todas las superficies detectadas (coordenadas locales de cada ancla). */
  surfaces?: { id: string; outline: Point2[] }[];
}

type AppProps = { callbacks: ARCallbacks; drawing: ARDrawing };

const v = (p: Point3): [number, number, number] => [p.x, p.y, p.z];
const p3 = (a: number[]): Point3 => ({ x: a[0], y: a[1], z: a[2] });

const PLANE_TYPES = new Set(['ExistingPlaneUsingExtent', 'ExistingPlane', 'EstimatedHorizontalPlane']);

// DIAGNÓSTICO TEMPORAL: registros en Metro (solo desarrollo), limitados por clave.
const dbgLast = new Map<string, number>();
function dbg(key: string, msg: string, everyMs = 2000) {
  if (!__DEV__) return;
  const t = Date.now();
  if (t - (dbgLast.get(key) ?? 0) < everyMs) return;
  dbgLast.set(key, t);
  console.log(`[DIAG] ${msg}`);
}

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
  const { callbacks } = props.arSceneNavigator.viroAppProps;
  const drawing = useSyncExternalStore(drawingStore.subscribe, drawingStore.get);
  const cb = useRef(callbacks);
  cb.current = callbacks;

  const onHit = (e: ViroCameraARHitTest) => {
    const cam = p3(e.cameraOrientation.position as unknown as number[]);
    // Preferir planos detectados sobre puntos de características (factor P).
    const results = [...e.hitTestResults].sort((a, b) => Number(PLANE_TYPES.has(b.type)) - Number(PLANE_TYPES.has(a.type)));
    const r = results[0];
    dbg('hit', `retícula: ${e.hitTestResults.length} resultados [${e.hitTestResults.map((h) => h.type).join(', ')}]`, 3000);
    if (!r) return cb.current.onReticle(null);
    const pos = p3(r.transform.position as unknown as number[]);
    cb.current.onReticle({
      position: pos,
      surface: PLANE_TYPES.has(r.type) ? 'plane' : 'featurePoint',
      cameraDistanceM: Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z),
      cameraPosition: cam,
    });
  };

  // Altas y actualizaciones de planos: ARCore refina su posición con el tiempo.
  const onAnchor = (a: ViroAnchor) => {
    dbg('anchor' + a.anchorId, `ancla ${a.anchorId} tipo=${a.type} alineación=${a.alignment} ${(a.width ?? 0).toFixed(2)}×${(a.height ?? 0).toFixed(2)} m vértices=${a.vertices?.length ?? 0}`, 5000);
    if (a.type !== 'plane' || !a.alignment) return;
    const kind = a.alignment === 'Vertical' ? 'wall' : a.alignment === 'HorizontalDownward' ? 'ceiling' : 'floor';
    const verts = (a.vertices ?? []).map((q) => ({ x: q[0], z: q[2] }));
    // El contorno da largo y ancho sin depender de la rotación; si no viene, se usa la extensión.
    const w = a.width ?? 0, h = a.height ?? 0, c0 = { x: a.center?.[0] ?? 0, z: a.center?.[2] ?? 0 };
    const extent = [{ x: c0.x - w / 2, z: c0.z - h / 2 }, { x: c0.x + w / 2, z: c0.z - h / 2 }, { x: c0.x + w / 2, z: c0.z + h / 2 }, { x: c0.x - w / 2, z: c0.z + h / 2 }];
    const outline = verts.length >= 3 ? verts : extent;
    const r = minAreaRect(outline);
    const size = { lengthM: r.lengthM, widthM: r.widthM };
    cb.current.onPlane({
      id: a.anchorId, kind, y: a.position[1] + (a.center?.[1] ?? 0),
      cx: a.position[0] + (a.center?.[0] ?? 0), cz: a.position[2] + (a.center?.[2] ?? 0), ...size,
      pose: { position: a.position, rotation: a.rotation }, outline, rect: r.corners,
    });
  };

  return (
    <ViroARScene
      ref={(r) => { sceneRef.current = r; }}
      anchorDetectionTypes={['planesHorizontal', 'planesVertical']}
      onTrackingUpdated={(s, r) => { dbg('track' + s + r, `seguimiento=${mapTracking(s)} causa=${mapCause(r)}`, 1000); cb.current.onTracking(mapTracking(s), mapCause(r)); }}
      onCameraARHitTest={onHit}
      onAnchorFound={onAnchor}
      onAnchorUpdated={onAnchor}
    >
      {drawing.points.map((p, i) => <ViroSphere key={`p${i}`} position={v(p)} radius={0.015} materials={['dimPoint']} />)}
      {drawing.segments.map(([a, b], i) => <ViroPolyline key={`s${i}`} points={[v(a), v(b)]} thickness={0.006} materials={['dimLine']} />)}
      {drawing.surfaces?.map((sf) => sf.outline.length > 2 && (
        <ViroARPlane key={sf.id} anchorId={sf.id}>
          <ViroPolyline points={closed(sf.outline, 0.002)} thickness={0.0015} materials={['dimSurface']} />
        </ViroARPlane>
      ))}
      {drawing.object && <ObjectOverlay o={drawing.object} />}
      {drawing.draft && <ViroSphere position={v(drawing.draft)} radius={0.01} materials={['dimDraft']} />}
    </ViroARScene>
  );
}

const LIFT = 0.004; // levanta las líneas 4 mm para que no parpadeen con la superficie
const l3 = (p: Point2, y = LIFT): [number, number, number] => [p.x, y, p.z];
const closed = (pts: Point2[], y = LIFT) => [...pts, pts[0]].map((p) => l3(p, y));
const mid = (a: Point2, b: Point2): Point2 => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
const lenOf = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);

const PILL_H = 0.035; // alto de la etiqueta (m)
/** Etiqueta tipo píldora que siempre mira a la cámara. */
function Pill({ at, text, kind = 'accent' }: { at: [number, number, number]; text: string; kind?: 'accent' | 'info' }) {
  const w = 0.03 + text.length * 0.016;
  return (
    <ViroNode position={at} transformBehaviors={['billboard']}>
      <ViroQuad width={w} height={PILL_H} materials={[kind === 'accent' ? 'pillAccent' : 'pillInfo']} />
      <ViroText text={text} position={[0, 0, 0.002]} scale={[0.1, 0.1, 0.1]} width={w * 10} height={PILL_H * 10}
        style={{ fontFamily: 'Arial', fontSize: 16, fontWeight: '700', color: kind === 'accent' ? '#0B0B0C' : '#FFFFFF', textAlign: 'center', textAlignVertical: 'center' }} />
    </ViroNode>
  );
}

/** Rectángulo relleno con cotas; si hay caída al piso, caja 3D completa con la altura. */
function ObjectOverlay({ o }: { o: ARObjectOverlay }) {
  const r = o.rect;
  if (r.length !== 4) return null;
  const longFirst = lenOf(r[0], r[1]) >= lenOf(r[1], r[2]);
  const [a, b, c] = longFirst ? [r[0], r[1], r[2]] : [r[1], r[2], r[3]];
  const center = mid(r[0], r[2]);
  const dy = o.drop?.dy ?? 0;
  return (
    <ViroARPlane anchorId={o.planeId}>
      <ViroPolygon vertices={r.map((p) => [p.x, -p.z])} holes={[]} rotation={[-90, 0, 0]} position={[0, 0.002, 0]} materials={['dimFill']} opacity={0.35} />
      <ViroPolyline points={closed(r)} thickness={0.007} materials={['dimLine']} />
      {r.map((p, i) => <ViroSphere key={'t' + i} position={l3(p)} radius={0.012} materials={['dimPoint']} />)}
      {o.drop && (
        <>
          <ViroPolyline points={closed(r, dy)} thickness={0.005} materials={['dimLine']} />
          {r.map((p, i) => (
            <ViroPolyline key={'v' + i} points={[l3(p, 0), l3(p, dy)]} thickness={0.005} materials={['dimLine']} />
          ))}
          {r.map((p, i) => <ViroSphere key={'b' + i} position={l3(p, dy)} radius={0.012} materials={['dimPoint']} />)}
          <Pill at={l3(a, dy / 2)} text={o.drop.label} />
        </>
      )}
      <Pill at={l3(mid(a, b), 0.04)} text={o.lengthLabel} />
      <Pill at={l3(mid(b, c), 0.04)} text={o.widthLabel} />
      {o.info.slice(0, 2).map((txt, i, arr) => (
        <Pill key={'i' + i} at={l3(center, 0.12 + (arr.length - 1 - i) * (PILL_H + 0.012))} text={txt} kind={i === 0 && arr.length > 1 ? 'accent' : 'info'} />
      ))}
    </ViroARPlane>
  );
}

/** Almacén del dibujo: la escena AR se suscribe y se redibuja en cuanto cambia (no depende de viroAppProps). */
const drawingStore = (() => {
  let value: ARDrawing = { points: [], segments: [], draft: null };
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (d: ARDrawing) => { value = d; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
})();

export interface ARMeasureViewHandle { reset: () => void }

/** Captura la imagen actual de la cámara (con lo dibujado) y devuelve la ruta del archivo, o null. */
export type CaptureFn = () => Promise<string | null>;

/** Objeto reconocido por el modelo en el teléfono (YOLOE). Recuadro en dp de pantalla. */
export interface Detection { label: string; confidence: number; box: ScreenBox }
/** Consulta el punto 3D (profundidad o plano) bajo un punto de la pantalla; null si no hay. */
export type HitTestFn = (x: number, y: number) => Promise<Point3 | null>;

const sceneRef: { current: any } = { current: null };
const HIT_PRIORITY: Record<string, number> = { DepthPoint: 0, ExistingPlaneUsingExtent: 1, ExistingPlane: 2, EstimatedHorizontalPlane: 3, FeaturePoint: 4 };
const hitTestScreen: HitTestFn = async (x, y) => {
  try {
    const res: any[] = (await sceneRef.current?.performARHitTestWithPoint?.(x, y)) ?? [];
    const best = [...res].sort((a, b) => (HIT_PRIORITY[a.type] ?? 9) - (HIT_PRIORITY[b.type] ?? 9))[0];
    dbg('probe', `toque (${x.toFixed(0)}, ${y.toFixed(0)}): ${res.length} resultados [${res.map((h) => h.type).join(', ')}]`, 300);
    return best ? p3(best.transform.position) : null;
  } catch { return null; }
};

export const OBJECT_MODEL = 'dimensiona-yoloe'; // assets/models/dimensiona-yoloe.onnx (scripts/export_yoloe.py)

export function ARMeasureView(props: AppProps & {
  resetSignal: number;
  captureRef?: { current: CaptureFn | null };
  hitTestRef?: { current: HitTestFn | null };
  /** Reconocimiento de objetos en el teléfono; undefined = apagado. */
  onDetections?: (d: Detection[]) => void;
  onDetectorError?: (msg: string) => void;
  /** Informa una vez si el teléfono admite la profundidad de ARCore (clave para medir objetos). */
  onDepthSupport?: (supported: boolean) => void;
  screenSize?: { w: number; h: number };
}) {
  const nav = useRef<any>(null);
  useEffect(() => { drawingStore.set(props.drawing); }, [props.drawing]);
  useEffect(() => { if (props.hitTestRef) props.hitTestRef.current = hitTestScreen; }, [props.hitTestRef]);
  const onDepth = useRef(props.onDepthSupport);
  onDepth.current = props.onDepthSupport;
  useEffect(() => {
    // La sesión AR tarda un momento en iniciar; se consulta después.
    const t = setTimeout(async () => {
      try {
        const n = nav.current;
        const ask = n?.arSceneNavigator?.isDepthOcclusionSupported ?? n?._isDepthOcclusionSupported;
        const r = await ask?.();
        dbg('depth', `profundidad ARCore: ${JSON.stringify(r)} (método ${ask ? 'encontrado' : 'NO encontrado'})`, 0);
        dbg('onnx', `módulo ViroONNX nativo: ${NativeModules.ViroONNX ? 'presente' : 'AUSENTE'} · ORT ${(() => { try { return NativeModules.ViroONNX?.getVersion?.() ?? '?'; } catch { return 'error'; } })()}`, 0);
        if (r) onDepth.current?.(!!r.supported);
      } catch { /* sin respuesta: no se informa */ }
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  const onDet = useRef(props.onDetections);
  onDet.current = props.onDetections;
  useEffect(() => {
    if (!props.captureRef) return;
    props.captureRef.current = async () => {
      const n = nav.current;
      const take = n?.arSceneNavigator?.takeScreenshot ?? n?._takeScreenshot;
      if (!take) return null;
      const r = await take(`dimensiona_${Date.now()}`, false); // false: no se guarda en la galería
      if (!r?.success || !r.url) return null;
      return String(r.url).startsWith("file://") ? r.url : `file://${r.url}`;
    };
  }, [props.captureRef]);
  useEffect(() => {
    if (props.resetSignal > 0) nav.current?.arSceneNavigator?.resetARSession?.(true, false);
    // Algunas versiones exponen el método directamente en la instancia.
    if (props.resetSignal > 0) nav.current?._resetARSession?.(true, false);
  }, [props.resetSignal]);
  return (
    <View style={{ flex: 1 }}>
      <ViroARSceneNavigator
        ref={nav}
        autofocus
        depthEnabled // ARCore Depth API: puntos 3D en cualquier superficie, no solo en planos (CR-04)
        initialScene={{ scene: MeasureScene as any }}
        viroAppProps={{ callbacks: props.callbacks, drawing: props.drawing }}
        style={{ flex: 1 }}
      />
      {props.onDetections && (
        <ViroObjectDetector
          style={{ position: 'absolute', width: 0, height: 0 }}
          model={OBJECT_MODEL}
          mode="prompt-free"
          confidenceThreshold={0.2}
          maxFPS={8}
          maxDetections={6}
          projectToWorld={false}
          onReady={() => dbg('detready', 'detector listo (modelo cargado)', 0)}
          onDetection={(e) => {
            dbg('det', `detector: ${e.detections.length} objetos [${e.detections.map((d) => `${d.label} ${(d.confidence * 100).toFixed(0)}%`).join(', ')}]`, 3000);
            const s = props.screenSize;
            onDet.current?.(e.detections.map((d) => ({
              label: d.label,
              confidence: d.confidence,
              box: d.screenBoundingBox ?? (s
                ? { x: d.boundingBox.x * s.w, y: d.boundingBox.y * s.h, width: d.boundingBox.width * s.w, height: d.boundingBox.height * s.h }
                : { x: 0, y: 0, width: 0, height: 0 }),
            })));
          }}
          onError={(e) => { dbg('deterr', `detector ERROR: ${e.error}`, 0); props.onDetectorError?.(e.error); }}
        />
      )}
    </View>
  );
}
