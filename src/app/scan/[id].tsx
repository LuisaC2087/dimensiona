/**
 * Escaneo y medición AR (RF-02, RF-03, RF-04, RF-05, RF-06, RF-12; CR-02).
 * Modos:
 *  - auto: la persona recorre las paredes con la cámara; la app detecta piso, techo y paredes y
 *          calcula esquinas, medidas y altura sola (CR-02). Respaldo: modo manual.
 *  - room (manual), distance, height, reference (calibración).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { ARMeasureView, type ARCallbacks, type DetectedPlane, type ReticleHit, type TrackingCause } from '../../ar/ARView';
import { addMeasurement, saveCorners, setCalibration, setHeight } from '../../db/repo';
import {
  calibrationFactor, combineReliability, computeReliability, distance3, estimateRoom, formatArea, formatLength,
  heightBetween, isFactorAcceptable, isHeightInRange, K_MAX, K_MIN, MAX_CORNERS, MIN_POINT_SEPARATION_M, parseDecimal,
  polygonArea, RELIABILITY_CONFIG, toFloor, validateContour, voxelKey,
  type Point3, type Reliability, type RoomEstimate, type TrackingState,
} from '../../lib';
import { useAppState } from '../../state/AppState';
import { Button, ReliabilityChip, ValueWithRange, s } from '../../components/ui';
import { colors, space } from '../../theme';

type Mode = 'auto' | 'room' | 'distance' | 'height' | 'reference';
interface Placed { p: Point3; rel: Reliability }

const TRACK_LABEL: Record<TrackingState, string> = { good: 'Bueno', limited: 'Limitado', lost: 'Perdido' };
const TRACK_COLOR: Record<TrackingState, string> = { good: colors.ok, limited: colors.warn, lost: colors.danger };
const CAUSE_MSG: Record<TrackingCause, string> = {
  none: '',
  motion: 'Mueves el teléfono muy rápido: hazlo más despacio.',
  features: 'Pocas texturas: apunta a zonas con objetos o bordes.',
  light: 'Poca luz: enciende una luz o acércate a una ventana.',
};
const CONTOUR_MSG: Record<string, string> = {
  tooFewCorners: 'Se necesitan al menos 3 esquinas para cerrar el contorno.',
  tooManyCorners: 'Máximo 12 esquinas.',
  shortWall: 'Hay una pared de menos de 30 cm. Revisa esa zona y vuelve a recorrerla.',
  crossingWalls: 'Hay paredes que se cruzan. Recorre de nuevo las paredes o usa el modo manual.',
};
const MAX_SAMPLES = 6000;
const UI_HZ_MS = 100; // la interfaz se actualiza a 10 Hz aunque la cámara entregue 30–60 fps

export default function Scan() {
  const { id, mode: initialMode, realM: realParam } = useLocalSearchParams<{ id: string; mode?: Mode; realM?: string }>();
  const realM = realParam ? Number(realParam) : null;
  const db = useSQLiteContext();
  const { compat, settings } = useAppState();
  const [mode, setMode] = useState<Mode>(initialMode === 'room' ? 'auto' : initialMode ?? 'auto');
  const [tracking, setTracking] = useState<{ state: TrackingState; cause: TrackingCause }>({ state: 'limited', cause: 'none' });
  const [reticle, setReticle] = useState<ReticleHit | null>(null);
  const [planeCount, setPlaneCount] = useState({ floor: 0, wall: 0, ceiling: 0 });
  const [points, setPoints] = useState<Placed[]>([]);
  const [lastResult, setLastResult] = useState<{ valueM: number; score: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [manualH, setManualH] = useState('');
  const [estimate, setEstimate] = useState<RoomEstimate | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const startedAt = useRef(Date.now());
  const lostSince = useRef<number | null>(null);
  const [lostLong, setLostLong] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Datos de alta frecuencia en refs (no provocan renders)
  const trackingRef = useRef<TrackingState>('limited');
  const lastUi = useRef(0);
  const planes = useRef(new Map<string, DetectedPlane>());
  const samples = useRef(new Map<string, Point3>());
  const stats = useRef({ n: 0, t: 0, plane: 0, dist: 0 });
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (compat && !compat.canScan) router.replace('/compat');
  }, [compat]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // RF-03: perdido > 5 s → ofrecer reinicio.
  useEffect(() => {
    if (tracking.state === 'lost') {
      lostSince.current ??= Date.now();
      setLostLong(Date.now() - lostSince.current > 5000);
    } else { lostSince.current = null; setLostLong(false); }
  }, [tracking.state, now]);

  const floorY = useCallback((): number | null => {
    const ys = [...planes.current.values()].filter((p) => p.kind === 'floor').map((p) => p.y);
    return ys.length ? Math.min(...ys) : null;
  }, []);
  const ceilingY = useCallback((f: number): number | null => {
    const ys = [...planes.current.values()].filter((p) => p.kind === 'ceiling' && p.y > f + 1.6).map((p) => p.y);
    return ys.length ? Math.max(...ys) : null;
  }, []);

  const callbacks: ARCallbacks = useMemo(() => ({
    onTracking: (state, cause) => {
      trackingRef.current = state;
      setTracking((t) => (t.state === state && t.cause === cause ? t : { state, cause }));
    },
    onReticle: (hit) => {
      // CR-02: muestreo continuo para la detección automática
      if (hit && modeRef.current === 'auto' && trackingRef.current !== 'lost' && hit.cameraDistanceM <= 6) {
        const key = voxelKey(hit.position);
        if (!samples.current.has(key) && samples.current.size < MAX_SAMPLES) {
          samples.current.set(key, hit.position);
          const st = stats.current;
          st.n += 1;
          st.t += RELIABILITY_CONFIG.tracking[trackingRef.current];
          st.plane += hit.surface === 'plane' ? 1 : 0;
          st.dist += hit.cameraDistanceM;
        }
      }
      const t = Date.now();
      if (t - lastUi.current >= UI_HZ_MS) {
        lastUi.current = t;
        setReticle(hit);
      }
    },
    onPlane: (p) => {
      planes.current.set(p.id, p);
      const c = { floor: 0, wall: 0, ceiling: 0 };
      planes.current.forEach((x) => { c[x.kind] += 1; });
      setPlaneCount((prev) => (prev.floor === c.floor && prev.wall === c.wall && prev.ceiling === c.ceiling ? prev : c));
    },
  }), []);

  // CR-02: recalcular la habitación cada 0,7 s mientras se escanea
  useEffect(() => {
    if (mode !== 'auto') return;
    const t = setInterval(() => {
      setSampleCount(samples.current.size);
      const f = floorY();
      if (f == null || samples.current.size < 60) return;
      setEstimate(estimateRoom([...samples.current.values()], f, ceilingY(f)));
    }, 700);
    return () => clearInterval(t);
  }, [mode, floorY, ceilingY]);

  const autoReliability = useCallback((fit: number): Reliability => {
    const st = stats.current;
    const n = Math.max(1, st.n);
    const base = computeReliability({
      tracking: st.t / n >= 0.75 ? 'good' : 'limited',
      surface: st.plane / n >= 0.5 ? 'plane' : 'featurePoint',
      cameraDistanceM: st.dist / n,
    });
    // Penaliza si muchas muestras de pared no encajan en ninguna pared detectada
    const score = base.score * Math.min(1, fit / 0.8);
    return { ...base, score, level: score >= 75 ? 'Alta' : score >= 50 ? 'Media' : 'Baja' };
  }, []);

  const resetAuto = () => {
    samples.current.clear();
    stats.current = { n: 0, t: 0, plane: 0, dist: 0 };
    setEstimate(null);
    setSampleCount(0);
  };

  const saveAuto = async () => {
    if (!estimate?.corners) return;
    const errors = validateContour(estimate.corners);
    if (errors.length) return setMessage(CONTOUR_MSG[errors[0].kind]);
    const rel = autoReliability(estimate.fit);
    await saveCorners(db, id, estimate.corners.map((c) => ({ ...c, confidence: rel.score })));
    if (estimate.heightM != null && isHeightInRange(estimate.heightM)) {
      await setHeight(db, id, estimate.heightM, rel.score);
      await addMeasurement(db, id, { kind: 'altura', valueM: estimate.heightM, a: null, b: null, confidence: rel.score, factors: { ...rel.factors, auto: true } });
      router.replace(`/project/${id}`);
    } else {
      setMode('height');
      setPoints([]);
      setMessage('Contorno guardado. No se detectó el techo: apunta al techo un momento, o marca la altura a mano.');
    }
  };

  const place = useCallback(async () => {
    setMessage(null);
    if (tracking.state === 'lost') return setMessage('Seguimiento perdido: no se pueden colocar puntos.');
    if (!reticle) return setMessage('No hay superficie en este punto, intenta otra zona.');
    const rel = computeReliability({ tracking: tracking.state, surface: reticle.surface, cameraDistanceM: reticle.cameraDistanceM });
    const placed: Placed = { p: reticle.position, rel };

    if (mode === 'distance') {
      const next = points.length >= 2 ? [placed] : [...points, placed];
      if (next.length === 2) {
        const [a, b] = next;
        const d = distance3(a.p, b.p);
        if (d < MIN_POINT_SEPARATION_M) return setMessage('Los puntos están a menos de 1 cm; se descartó el segundo.');
        const r = combineReliability([a.rel, b.rel]);
        await addMeasurement(db, id, { kind: 'distancia', valueM: d, a: a.p, b: b.p, confidence: r.score, factors: { ...r.factors, partial: r.partial } });
        setLastResult({ valueM: d, score: r.score });
      }
      setPoints(next);
    } else if (mode === 'reference') {
      const next = points.length >= 2 ? [placed] : [...points, placed];
      if (next.length === 2 && realM) {
        const measured = distance3(next[0].p, next[1].p);
        if (measured < MIN_POINT_SEPARATION_M) return setMessage('Los puntos están a menos de 1 cm; se descartó el segundo.');
        const k = calibrationFactor(realM, measured);
        const r = combineReliability([next[0].rel, next[1].rel]);
        await addMeasurement(db, id, { kind: 'referencia', valueM: measured, a: next[0].p, b: next[1].p, confidence: r.score, factors: { ...r.factors, realM, k } });
        const errPct = (Math.abs(measured - realM) / realM) * 100;
        const fmt = (n: number, d: number) => n.toFixed(d).replace('.', ',');
        if (!isFactorAcceptable(k)) {
          Alert.alert('Medición de referencia dudosa',
            `Se midieron ${formatLength(measured, 'cm', 3)} frente a ${formatLength(realM, 'cm', 3)} reales (k = ${fmt(k, 3)}, fuera de ${fmt(K_MIN, 2)}–${fmt(K_MAX, 2)}). Probablemente la medición falló: repítela.`,
            [{ text: 'Repetir', onPress: () => setPoints([]) }]);
        } else {
          Alert.alert('Factor de calibración',
            `Medido: ${formatLength(measured, 'cm', 3)} · Real: ${formatLength(realM, 'cm', 3)}\nError sin calibrar: ${fmt(errPct, 1)} %\nk = ${fmt(k, 3)}\n\n¿Aplicarlo a todo el proyecto?`,
            [
              { text: 'Repetir', style: 'cancel', onPress: () => setPoints([]) },
              { text: 'Aplicar', onPress: async () => { await setCalibration(db, id, k); router.replace(`/project/${id}`); } },
            ]);
        }
      }
      setPoints(next);
    } else if (mode === 'room') {
      if (points.length >= MAX_CORNERS) return setMessage('Máximo 12 esquinas. Cierra el contorno.');
      setPoints([...points, placed]);
    } else if (mode === 'height') {
      const next = points.length >= 2 ? [placed] : [...points, placed];
      if (next.length === 2) {
        const h = heightBetween(next[0].p, next[1].p);
        const r = combineReliability([next[0].rel, next[1].rel]);
        const save = async () => {
          await setHeight(db, id, h, r.score);
          await addMeasurement(db, id, { kind: 'altura', valueM: h, a: next[0].p, b: next[1].p, confidence: r.score, factors: { ...r.factors, partial: r.partial } });
          setLastResult({ valueM: h, score: r.score });
        };
        if (!isHeightInRange(h)) {
          Alert.alert('Altura poco común', `Se midieron ${h.toFixed(2)} m (fuera de 1,80–6,00 m). ¿Guardar de todos modos?`, [
            { text: 'Repetir', style: 'cancel', onPress: () => setPoints([]) },
            { text: 'Guardar', onPress: save },
          ]);
        } else await save();
      }
      setPoints(next);
    }
  }, [tracking.state, reticle, mode, points, db, id, realM]);

  // Altura automática a partir de los planos piso/techo (sin tocar puntos)
  const autoHeight = useMemo(() => {
    void planeCount;
    const f = floorY();
    if (f == null) return null;
    const c = ceilingY(f);
    return c == null ? null : c - f;
  }, [planeCount, floorY, ceilingY]);

  const saveAutoHeight = async () => {
    if (autoHeight == null) return;
    const rel = autoReliability(1);
    await setHeight(db, id, autoHeight, rel.score);
    await addMeasurement(db, id, { kind: 'altura', valueM: autoHeight, a: null, b: null, confidence: rel.score, factors: { ...rel.factors, auto: true } });
    router.replace(`/project/${id}`);
  };

  const undo = () => { setPoints((p) => p.slice(0, -1)); setLastResult(null); };

  const closeContour = async () => {
    const poly = points.map((x) => toFloor(x.p));
    const errors = validateContour(poly);
    if (errors.length) return setMessage(CONTOUR_MSG[errors[0].kind]);
    await saveCorners(db, id, points.map((x) => ({ ...toFloor(x.p), confidence: x.rel.score })));
    setPoints([]);
    setMode('height');
    setMessage('Contorno guardado. Ahora apunta al techo para detectar la altura, o márcala a mano.');
  };

  const saveManualHeight = async () => {
    const h = parseDecimal(manualH);
    if (h == null) return setMessage('Escribe un número, por ejemplo 2,45.');
    const save = async () => { await setHeight(db, id, h, 50); router.replace(`/project/${id}`); };
    if (!isHeightInRange(h)) {
      Alert.alert('Altura poco común', '¿Confirmas una altura fuera de 1,80–6,00 m?', [{ text: 'No', style: 'cancel' }, { text: 'Sí', onPress: save }]);
    } else await save();
  };

  const drawing = useMemo(() => {
    if (mode === 'auto') {
      const f = floorY();
      const cs = estimate?.corners;
      if (!cs || f == null) return { points: [], segments: [], draft: reticle?.position ?? null };
      const ps = cs.map((c) => ({ x: c.x, y: f, z: c.z }));
      return { points: ps, segments: ps.map((p, i) => [p, ps[(i + 1) % ps.length]] as [Point3, Point3]), draft: reticle?.position ?? null };
    }
    const ps = points.map((x) => x.p);
    const segs: [Point3, Point3][] = [];
    for (let i = 1; i < ps.length; i++) segs.push([ps[i - 1], ps[i]]);
    return { points: ps, segments: segs, draft: reticle?.position ?? null };
  }, [mode, points, reticle, estimate, floorY]);

  const liveRel = reticle ? computeReliability({ tracking: tracking.state, surface: reticle.surface, cameraDistanceM: reticle.cameraDistanceM }) : null;
  const noPlanesHint = planeCount.floor + planeCount.wall === 0 && now - startedAt.current > 20000;

  const autoInstruction =
    planeCount.floor === 0 ? '1/3 · Apunta al piso y mueve el teléfono despacio hasta que se detecte.'
      : !estimate?.corners ? `2/3 · Recorre cada pared con la retícula, de un extremo al otro, a la altura del pecho. Paredes: ${estimate?.walls ?? 0}`
        : autoHeight == null ? '3/3 · Apunta un momento al techo para medir la altura (o guarda y márcala después).'
          : 'Listo. Revisa la vista previa y guarda.';
  const instruction =
    mode === 'auto' ? autoInstruction
      : mode === 'reference' ? (points.length === 1 ? 'Marca el otro extremo de la referencia' : 'Marca un extremo del objeto de referencia')
        : mode === 'distance' ? (points.length === 1 ? 'Apunta al punto B y toca «Marcar»' : 'Apunta al punto A y toca «Marcar»')
          : mode === 'room' ? `Marca la esquina ${points.length + 1} (pared con piso)`
            : autoHeight != null ? 'Altura detectada con los planos de piso y techo.'
              : points.length === 0 ? 'Apunta al techo para detectarlo, o toca «Marcar» en el piso' : 'Ahora apunta al techo, en la misma vertical';

  if (!compat?.canScan) return <View style={s.screen} />;

  const autoRel = estimate?.corners ? autoReliability(estimate.fit) : null;

  return (
    <View style={s.screen}>
      <ARMeasureView callbacks={callbacks} drawing={drawing} resetSignal={resetSignal} />

      <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderWidth: 2, borderColor: reticle ? colors.accent : colors.textMuted, borderRadius: 8 }} />

      <SafeAreaView pointerEvents="box-none" style={{ position: 'absolute', inset: 0, justifyContent: 'space-between', padding: space.md }}>
        <View style={{ gap: space.sm }}>
          <View style={[s.row, { backgroundColor: 'rgba(11,11,12,0.85)', borderRadius: 999, padding: space.sm }]}>
            <Text style={{ color: TRACK_COLOR[tracking.state], fontWeight: '700', fontSize: 15 }}>● {TRACK_LABEL[tracking.state]}</Text>
            <Text style={s.muted}>Piso {planeCount.floor ? '✓' : '—'} · Paredes {planeCount.wall} · Techo {planeCount.ceiling ? '✓' : '—'}</Text>
          </View>
          {!!CAUSE_MSG[tracking.cause] && tracking.state !== 'good' && <Text style={banner}>{CAUSE_MSG[tracking.cause]}</Text>}
          {noPlanesHint && <Text style={banner}>No detectamos superficies. Mejora la luz, acércate a superficies con textura y mueve el teléfono más despacio.</Text>}
          {lostLong && (
            <View style={{ gap: space.sm }}>
              <Text style={banner}>Se perdió el seguimiento. Tus mediciones guardadas se conservan.</Text>
              <Button label="Reiniciar escaneo" onPress={() => {
                setResetSignal((n) => n + 1); planes.current.clear(); setPlaneCount({ floor: 0, wall: 0, ceiling: 0 });
                resetAuto(); setPoints([]); startedAt.current = Date.now();
              }} />
            </View>
          )}
        </View>

        <View style={{ gap: space.sm, backgroundColor: 'rgba(11,11,12,0.88)', borderRadius: 16, padding: space.md }}>
          {mode === 'reference' ? (
            <Text style={s.h2}>Calibración · referencia {realM ? formatLength(realM, 'cm', 3) : ''}</Text>
          ) : (
            <View style={s.row}>
              {(['auto', 'distance', 'height'] as Mode[]).map((m) => (
                <Button key={m} label={m === 'auto' ? 'Habitación' : m === 'distance' ? 'Distancia' : 'Altura'}
                  variant={m === mode || (m === 'auto' && mode === 'room') ? 'primary' : 'secondary'} style={{ flex: 1 }}
                  onPress={() => { setMode(m); setPoints([]); setLastResult(null); setMessage(null); }} />
              ))}
            </View>
          )}

          <View style={s.row}>
            <Text style={[s.body, { flex: 1 }]}>{instruction}</Text>
            {mode !== 'auto' && liveRel && <ReliabilityChip score={liveRel.score} />}
          </View>

          {mode === 'auto' && (
            <>
              <Text style={s.muted}>Muestras: {sampleCount}{estimate ? ` · paredes: ${estimate.walls} · ajuste ${Math.round(estimate.fit * 100)} %` : ''}</Text>
              {estimate?.corners && autoRel && (
                <View style={s.row}>
                  <Text style={s.value}>
                    {formatArea(polygonArea(estimate.corners), settings.decimals)}
                    {autoHeight != null ? ` · h ${formatLength(autoHeight, settings.unit, settings.decimals)}` : ''}
                  </Text>
                  <ReliabilityChip score={autoRel.score} />
                </View>
              )}
              {message && <Text style={{ color: colors.warn, fontSize: 15 }}>{message}</Text>}
              <View style={s.row}>
                <Button label="Reiniciar" variant="secondary" onPress={resetAuto} />
                <Button label="Guardar habitación" style={{ flex: 1 }} onPress={saveAuto} disabled={!estimate?.corners} />
              </View>
              <Button label="Marcar esquinas a mano" variant="secondary" onPress={() => { setMode('room'); setPoints([]); setMessage(null); }} />
            </>
          )}

          {mode !== 'auto' && (
            <>
              {lastResult && <ValueWithRange valueM={lastResult.valueM} score={lastResult.score} unit={settings.unit} decimals={settings.decimals} />}
              {message && <Text style={{ color: colors.warn, fontSize: 15 }}>{message}</Text>}
              {mode === 'height' && autoHeight != null && (
                <Button label={`Usar altura detectada: ${formatLength(autoHeight, settings.unit, settings.decimals)}`} onPress={saveAutoHeight} />
              )}
              {mode === 'height' && (
                <View style={s.row}>
                  <TextInput value={manualH} onChangeText={setManualH} keyboardType="decimal-pad" placeholder="Altura manual (m)"
                    placeholderTextColor={colors.textMuted} style={{ flex: 1, minHeight: 48, color: colors.text, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 }} />
                  <Button label="Usar" variant="secondary" onPress={saveManualHeight} />
                </View>
              )}
              <View style={s.row}>
                <Button label="Deshacer" variant="secondary" onPress={undo} disabled={points.length === 0} />
                {mode === 'room' && <Button label="Cerrar contorno" variant="secondary" onPress={closeContour} disabled={points.length < 3} />}
                <Button label="Marcar" onPress={place} disabled={tracking.state === 'lost'} style={{ flex: 1 }} />
              </View>
            </>
          )}
          <Button label="Ver resultados" variant="secondary" onPress={() => router.replace(`/project/${id}`)} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const banner = { color: colors.text, backgroundColor: 'rgba(11,11,12,0.85)', borderRadius: 12, padding: 10, fontSize: 15 } as const;
