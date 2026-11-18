/**
 * Medición rápida (RF-03 / RF-04), sin crear proyecto. Acceso directo desde Inicio.
 *  - Objeto: apunta a la cara superior de un objeto (mesa, caja, mueble). ARCore la detecta como
 *            plano y la app calcula largo, ancho y altura sola.
 *  - Distancia: marca A y B; mientras apuntas a B la distancia se ve en vivo.
 * Unidades: metros o centímetros (internamente siempre metros, RF-15).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ARMeasureView, type ARCallbacks, type ARObjectOverlay, type CaptureFn, type DetectedPlane, type ReticleHit } from '../ar/ARView';
import {
  combineReliability, computeReliability, distance3, floorLevel, formatArea, formatLength, formatVolume, labelEs, MIN_POINT_SEPARATION_M,
  type HPlane, type Point3, type Reliability, type TrackingState, type Unit,
} from '../lib';
import { useAppState } from '../state/AppState';
import { useCloud } from '../state/CloudState';
import { identifyImage, type AIObject } from '../ai/identify';
import { Button, Disclaimer, ReliabilityChip, s } from '../components/ui';
import { DetectionOverlay } from '../components/DetectionOverlay';
import { useObjectRecognition } from '../state/useObjectRecognition';
import type { HitTestFn } from '../ar/ARView';
import { colors, space } from '../theme';

type Mode = 'object' | 'distance';
interface Placed { p: Point3; rel: Reliability }
interface Result { label: string; valueM: number; score: number }

const TRACK_LABEL: Record<TrackingState, string> = { good: 'Bueno', limited: 'Limitado', lost: 'Perdido' };
const TRACK_COLOR: Record<TrackingState, string> = { good: colors.ok, limited: colors.warn, lost: colors.danger };
const UI_HZ_MS = 100;
const AI_PERIOD_MS = 5000; // plan gratuito de Gemini: ~12 consultas por minuto
let aiConsent = false; // consentimiento por sesión de la app (Ley 1581: la imagen sale del teléfono)

export default function Measure() {
  const { compat, settings } = useAppState();
  const [mode, setMode] = useState<Mode>('object');
  const [unit, setUnit] = useState<Unit>(settings.unit === 'cm' ? 'cm' : 'm');
  const [tracking, setTracking] = useState<TrackingState>('limited');
  const [reticle, setReticle] = useState<ReticleHit | null>(null);
  const [planeTick, setPlaneTick] = useState(0);
  const [points, setPoints] = useState<Placed[]>([]);
  const [frozen, setFrozen] = useState<Result[] | null>(null);
  const [selPlaneId, setSelPlaneId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const planes = useRef(new Map<string, DetectedPlane>());
  const captureRef = useRef<CaptureFn | null>(null);
  const cloud = useCloud();
  const [ai, setAi] = useState<{ busy: boolean; result: AIObject[] | null; error: string | null; at: number }>({ busy: false, result: null, error: null, at: 0 });
  const [aiOn, setAiOn] = useState(false);
  const [screen, setScreen] = useState({ w: 0, h: 0 });
  const aiReady = cloud.configured && cloud.online && cloud.signedIn;
  // CR-04: reconocimiento en el teléfono (sin internet), activado por defecto
  const [showOptions, setShowOptions] = useState(false);
  const [depthOk, setDepthOk] = useState<boolean | null>(null);
  const hitTestRef = useRef<HitTestFn | null>(null);
  const lastUi = useRef(0);
  const recogOn = aiOn; // el reconocimiento lo hace la IA en la nube
  const recog = useObjectRecognition({ enabled: recogOn && mode === 'object', hitTestRef, reticle, screen });

  useEffect(() => {
    if (compat && !compat.canScan) router.replace('/compat');
  }, [compat]);

  const callbacks: ARCallbacks = useMemo(() => ({
    onTracking: (st) => setTracking(st),
    onReticle: (hit) => {
      const t = Date.now();
      if (t - lastUi.current >= UI_HZ_MS) { lastUi.current = t; setReticle(hit); }
    },
    onPlane: (p) => {
      planes.current.set(p.id, p);
      setPlaneTick((n) => n + 1);
    },
  }), []);

  const hPlanes: HPlane[] = useMemo(
    () => [...planes.current.values()].filter((p) => p.kind === 'floor'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planeTick],
  );
  const floorY = floorLevel(hPlanes);
  const liveRel = reticle ? computeReliability({ tracking, surface: reticle.surface, cameraDistanceM: reticle.cameraDistanceM }) : null;

  // Superficie seleccionada al tocarla (piso, pared, mesa…). Las medidas se muestran solo a pedido.
  const selPlane = mode === 'object' && selPlaneId ? planes.current.get(selPlaneId) ?? null : null;
  // Altura sobre la superficie que lo sostiene (mesa, repisa…); si no hay ninguna debajo, sobre el piso.
  let baseY: number | null = floorY;
  if (selPlane && selPlane.kind === 'floor') {
    for (const pl of planes.current.values()) {
      if (pl.kind !== 'floor' || pl.id === selPlane.id || pl.y > selPlane.y - 0.03) continue;
      if (Math.hypot(selPlane.cx - pl.cx, selPlane.cz - pl.cz) > Math.hypot(pl.lengthM, pl.widthM) / 2) continue;
      if (baseY == null || pl.y > baseY) baseY = pl.y;
    }
  }
  const selPlaneHeight = selPlane && selPlane.kind === 'floor' && baseY != null && selPlane.y - baseY >= 0.03 ? selPlane.y - baseY : null;

  // Distancia en vivo A → retícula
  const liveDist = mode === 'distance' && points.length === 1 && reticle ? distance3(points[0].p, reticle.position) : null;

  const drawing = useMemo(() => {
    const pts = points.map((x) => x.p);
    const segs: [Point3, Point3][] = [];
    if (pts.length === 2) segs.push([pts[0], pts[1]]);
    else if (pts.length === 1 && reticle) segs.push([pts[0], reticle.position]);
    const fmt = (m: number) => formatLength(m, unit, settings.decimals);
    let object: ARObjectOverlay | null = null;
    if (selPlane) {
      const l = selPlane.lengthM, w = selPlane.widthM;
      object = {
        planeId: selPlane.id, rect: selPlane.rect, lengthLabel: fmt(l), widthLabel: fmt(w),
        drop: selPlaneHeight != null && baseY != null ? { dy: baseY - selPlane.pose.position[1], label: `H=${fmt(selPlaneHeight)}` } : null,
        info: [
          ...(selPlaneHeight != null ? [`V=${formatVolume(l * w * selPlaneHeight, settings.decimals)}`] : []),
          `S=${formatArea(l * w, settings.decimals)}`,
        ],
      };
    }
    const surfaces = [...planes.current.values()].filter((p) => p.id !== object?.planeId).map((p) => ({ id: p.id, outline: p.outline }));
    return { points: pts, segments: segs, draft: mode === 'distance' ? reticle?.position ?? null : null, object, surfaces };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, reticle, mode, baseY, selPlane, selPlaneHeight, unit, settings.decimals, planeTick]);

  const switchMode = (m: Mode) => { setMode(m); setPoints([]); setFrozen(null); setSelPlaneId(null); recog.clear(); setMessage(null); };

  const place = () => {
    if (!reticle || tracking === 'lost') return setMessage('Sin seguimiento: mueve el teléfono despacio.');
    const rel = computeReliability({ tracking, surface: reticle.surface, cameraDistanceM: reticle.cameraDistanceM });
    const next = points.length >= 2 ? [{ p: reticle.position, rel }] : [...points, { p: reticle.position, rel }];
    if (next.length === 2) {
      const d = distance3(next[0].p, next[1].p);
      if (d < MIN_POINT_SEPARATION_M) return setMessage('Los puntos están a menos de 1 cm; marca B más lejos.');
      setFrozen([{ label: 'Distancia', valueM: d, score: combineReliability([next[0].rel, next[1].rel]).score }]);
    } else setFrozen(null);
    setMessage(null);
    setPoints(next);
  };

  // IA en tiempo real: mientras el interruptor esté activo, una consulta tras otra (nunca dos a la vez)
  useEffect(() => {
    if (!aiOn || !aiReady) return;
    let alive = true;
    (async () => {
      while (alive) {
        const started = Date.now();
        setAi((a) => ({ ...a, busy: true }));
        try {
          const uri = await captureRef.current?.();
          if (!uri) throw new Error('No se pudo tomar la imagen de la cámara.');
          const result = await identifyImage(uri);
          if (alive) setAi({ busy: false, result, error: null, at: Date.now() });
        } catch (e) {
          if (alive) setAi((a) => ({ ...a, busy: false, error: e instanceof Error ? e.message : 'Error al identificar.' }));
          await new Promise((r) => setTimeout(r, 3000)); // espera extra tras un error
        }
        const wait = Math.max(0, AI_PERIOD_MS - (Date.now() - started));
        await new Promise((r) => setTimeout(r, wait));
      }
    })();
    return () => { alive = false; };
  }, [aiOn, aiReady]);

  // La IA en la nube es el detector: sus recuadros se miden con la malla 3D de ARCore (CR-05).
  const aiFeeds = aiOn && mode === 'object';
  const recogOnDetections = recog.onDetections;
  useEffect(() => {
    if (!aiFeeds || !screen.w || !ai.result) return;
    recogOnDetections(ai.result.map((o) => ({
      label: o.nombre,
      confidence: o.confianza === 'alta' ? 0.9 : o.confianza === 'media' ? 0.6 : 0.3,
      box: { x: o.caja.x * screen.w, y: o.caja.y * screen.h, width: o.caja.ancho * screen.w, height: o.caja.alto * screen.h },
    })));
  }, [aiFeeds, ai.result, screen, recogOnDetections]);

  // Pide el consentimiento al entrar (una vez por sesión) y activa la IA en cuanto haya conexión.
  useEffect(() => {
    if (!aiReady || aiOn) return;
    if (aiConsent) { setAiOn(true); return; }
    Alert.alert(
      'Reconocer objetos con IA',
      'Para reconocer los objetos se enviarán imágenes de la cámara (cada pocos segundos) a Google Gemini (IA). No se guardan en DIMENSIONA, pero Google puede usarlas para mejorar su servicio gratuito. Evita enfocar personas o documentos.',
      [{ text: 'Ahora no', style: 'cancel' }, { text: 'Activar', onPress: () => { aiConsent = true; setAiOn(true); } }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady]);

  const toggleAi = () => {
    if (aiOn) { setAiOn(false); setAi({ busy: false, result: null, error: null, at: 0 }); return; }
    if (aiConsent) return setAiOn(true);
    Alert.alert(
      'Activar IA',
      'Mientras esté activada, se enviarán imágenes de la cámara (cada pocos segundos) a un servicio de inteligencia artificial para reconocer el objeto. No se guardan en DIMENSIONA. Evita enfocar personas o documentos.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Activar', onPress: () => { aiConsent = true; setAiOn(true); } }],
    );
  };

  if (!compat?.canScan) return <View style={s.screen} />;

  // Toque en la cámara: primero objetos reconocidos; si no, la superficie bajo el dedo.
  const onTap = async (x: number, y: number) => {
    if (mode !== 'object') return;
    setMessage(null);
    if (recogOn && recog.selectAt(x, y)) return setSelPlaneId(null);
    const p = await recog.probe(x, y);
    let best: DetectedPlane | null = null;
    if (p) {
      for (const pl of planes.current.values()) {
        const d = Math.hypot(p.x - pl.cx, p.z - pl.cz, pl.kind === 'wall' ? p.y - pl.y : 0);
        if (d > Math.hypot(pl.lengthM, pl.widthM) / 2 + 0.1) continue;
        if (pl.kind !== 'wall' && Math.abs(p.y - pl.y) > 0.08) continue;
        if (!best || pl.lengthM * pl.widthM < best.lengthM * best.widthM) best = pl;
      }
    }
    if (__DEV__) console.log(`[DIAG] toque: punto=${p ? `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}` : 'NINGUNO'} planos=${planes.current.size} objetos=${recog.items.length} elegido=${best?.kind ?? 'ninguno'}`);
    setSelPlaneId(best?.id ?? null);
    if (!best) setMessage('Ahí no hay un objeto ni una superficie detectada todavía. Mueve el teléfono despacio y vuelve a tocar.');
  };

  // Una sola línea de resultado (la cámara debe verse)
  const fmt = (m: number) => formatLength(m, unit, settings.decimals);
  const camDist = (pl: DetectedPlane) => (reticle ? Math.hypot(reticle.cameraPosition.x - pl.cx, reticle.cameraPosition.y - pl.y, reticle.cameraPosition.z - pl.cz) : undefined);
  let resultText: string | null = null;
  let resultScore: number | null = null;
  let resultPartial = false;
  if (mode === 'distance') {
    const d = frozen?.[0]?.valueM ?? liveDist;
    if (d != null) { resultText = `≈ ${fmt(d)}`; resultScore = frozen?.[0]?.score ?? liveRel?.score ?? null; }
  } else if (recog.selected) {
    const m = recog.measure;
    const name = labelEs(recog.selected.label);
    if (m && m.widthM != null && m.heightM != null) {
      resultText = `${name} ≈ ${fmt(m.widthM)} ancho × ${fmt(m.heightM)} alto`;
      // Profundidad: P = punto suelto; se penaliza la dispersión de la escala entre puntos (RF-09)
      const base = computeReliability({ tracking, surface: 'featurePoint', cameraDistanceM: m.distanceM ?? undefined });
      resultScore = base.score * Math.max(0.3, 1 - 3 * m.spread);
      resultPartial = true;
    } else {
      resultText = `${name} · midiendo… mantén el teléfono quieto`;
    }
  } else if (selPlane) {
    const kind = selPlane.kind === 'wall' ? (selPlane.lengthM >= 1 ? 'Pared' : 'Superficie vertical') : selPlane.kind === 'ceiling' ? 'Techo' : selPlaneHeight != null ? 'Superficie' : 'Piso';
    resultText = `${kind} ≈ ${fmt(selPlane.lengthM)} × ${fmt(selPlane.widthM)}${selPlaneHeight != null ? ` · alto ${fmt(selPlaneHeight)}` : ''}`;
    resultScore = computeReliability({ tracking, surface: 'plane', cameraDistanceM: camDist(selPlane) }).score;
  }
  const hasSelection = !!recog.selected || !!selPlane;

  const hint = mode === 'object'
    ? (aiOn && ai.error ? `IA: ${ai.error}`
      : !aiReady ? (!cloud.online ? 'Sin internet: solo se reconocen superficies' : 'Inicia sesión para reconocer objetos')
      : aiOn && !ai.result ? 'Reconociendo objetos…'
      : planes.current.size === 0 && recog.items.length === 0 ? 'Mueve el teléfono despacio para detectar' : 'Toca un objeto o una superficie para medirlo')
    : points.length === 0 ? 'Apunta al punto A' : points.length === 1 ? 'Apunta al punto B' : '';

  const reset = () => {
    setResetSignal((n) => n + 1); planes.current.clear(); setPlaneTick((n) => n + 1);
    setFrozen(null); setSelPlaneId(null); recog.clear(); setPoints([]);
  };

  return (
    <View style={s.screen} onLayout={(e) => setScreen({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <ARMeasureView callbacks={callbacks} drawing={drawing} resetSignal={resetSignal} captureRef={captureRef}
        hitTestRef={hitTestRef} screenSize={screen}
        onDetectorError={recog.onError} onDepthSupport={setDepthOk} />
      {recogOn && mode === 'object' && <DetectionOverlay items={recog.items} />}
      {mode === 'object' && (
        <Pressable accessibilityLabel="Toca un objeto o una superficie para medirlo" style={{ position: 'absolute', inset: 0 }}
          onPress={(e) => { void onTap(e.nativeEvent.locationX, e.nativeEvent.locationY); }} />
      )}
      {mode === 'distance' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 28, height: 28, marginLeft: -14, marginTop: -14, borderWidth: 2, borderColor: reticle ? colors.accent : 'rgba(255,255,255,0.6)', borderRadius: 14 }} />
      )}

      <SafeAreaView pointerEvents="box-none" style={{ position: 'absolute', inset: 0, justifyContent: 'space-between', padding: space.sm }}>
        {/* barra superior mínima */}
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={round}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>‹</Text>
          </Pressable>
          <View style={[s.row, glass, { gap: 2 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TRACK_COLOR[tracking], marginHorizontal: 8 }}
              accessibilityLabel={`Seguimiento ${TRACK_LABEL[tracking]}`} />
            {(['m', 'cm'] as Unit[]).map((u) => (
              <Pressable key={u} accessibilityRole="button" onPress={() => setUnit(u)}
                style={[seg, u === unit && { backgroundColor: colors.accent }]}>
                <Text style={{ color: u === unit ? colors.onAccent : colors.text, fontWeight: '800', fontSize: 15 }}>{u}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* panel inferior compacto */}
        <View style={{ gap: space.sm }}>
          {!!(resultText || hint || message) && (
            <View style={[s.row, glass, { paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'center', maxWidth: '100%' }]}>
              <Text style={{ color: message ? colors.warn : colors.text, fontSize: resultText && !message ? 18 : 15, fontWeight: resultText ? '800' : '500', flexShrink: 1 }} numberOfLines={2}>
                {message ?? resultText ?? hint}
              </Text>
              {!message && resultText && resultScore != null && <ReliabilityChip score={resultScore} partial={resultPartial} />}
            </View>
          )}

          {showOptions && (
            <View style={[glass, { padding: space.sm, gap: space.sm, borderRadius: 16 }]}>
              <Text style={s.muted}>
                Sensor de profundidad: {depthOk == null ? 'comprobando…' : depthOk ? 'disponible (medidas de objetos más precisas)' : 'no disponible en este teléfono: las medidas de objetos son menos precisas; usa Distancia A–B'}
                {' · '}Calibración de pantalla: {recog.calibrated ? 'lista' : 'pendiente (apunta al piso unos segundos)'}
              </Text>
              {cloud.configured && (
                <>
                  <Button label={aiOn ? '👁 Reconocer objetos (IA): sí' : '👁 Reconocer objetos (IA): no'} variant={aiOn ? 'primary' : 'secondary'}
                    disabled={!aiReady && !aiOn} onPress={toggleAi} />
                  {aiOn && ai.result && <Text style={s.muted} numberOfLines={2}>{ai.result.length} reconocidos: {ai.result.map((o) => o.nombre).join(', ')}</Text>}
                  {aiOn && ai.error && <Text style={{ color: colors.warn, fontSize: 14 }}>{ai.error}</Text>}
                  {!aiReady && <Text style={s.muted}>{!cloud.online ? 'Sin conexión' : 'Inicia sesión para usar la IA en la nube'}</Text>}
                </>
              )}
              <Button label="Reiniciar detección" variant="secondary" onPress={reset} />
              <Disclaimer />
            </View>
          )}

          <View style={[s.row, glass, { padding: 6 }]}>
            {(['object', 'distance'] as Mode[]).map((m) => (
              <Pressable key={m} accessibilityRole="button" onPress={() => switchMode(m)}
                style={[seg, { flex: 1 }, m === mode && { backgroundColor: colors.surfaceAlt }]}>
                <Text style={{ color: m === mode ? colors.accent : colors.textMuted, fontWeight: '800', fontSize: 15 }}>
                  {m === 'object' ? 'Objeto' : 'Distancia'}
                </Text>
              </Pressable>
            ))}
            {mode === 'object' ? (
              <ActionBtn label="Quitar" disabled={!hasSelection} onPress={() => { setSelPlaneId(null); recog.clear(); }} />
            ) : (
              <ActionBtn label={points.length === 0 ? 'A' : points.length === 1 ? 'B' : 'Nueva'} disabled={tracking === 'lost'}
                onPress={points.length === 2 ? () => { setPoints([]); setFrozen(null); } : place} />
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Opciones" onPress={() => setShowOptions((v) => !v)}
              style={[round, { backgroundColor: showOptions ? colors.surfaceAlt : 'transparent' }]}>
              <Text style={{ color: colors.text, fontSize: 20 }}>⚙</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ActionBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={{ minWidth: 72, height: 48, borderRadius: 24, paddingHorizontal: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: colors.onAccent, fontWeight: '800', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const glass = { backgroundColor: 'rgba(11,11,12,0.72)', borderRadius: 999 } as const;
const round = { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,11,12,0.72)' } as const;
const seg = { minWidth: 48, height: 40, borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' } as const;
