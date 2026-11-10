/**
 * Escaneo y medición AR (RF-02, RF-03, RF-04, RF-05, RF-06).
 * Modos: distancia (A–B), habitación (esquinas) y altura (piso–techo).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { ARMeasureView, type ARCallbacks, type ReticleHit, type TrackingCause } from '../../ar/ARView';
import { addMeasurement, saveCorners, setCalibration, setHeight } from '../../db/repo';
import {
  calibrationFactor, combineReliability, computeReliability, formatLength, isFactorAcceptable, K_MAX, K_MIN, distance3, heightBetween, isHeightInRange, MAX_CORNERS,
  MIN_POINT_SEPARATION_M, parseDecimal, toFloor, validateContour, type Point3, type Reliability, type TrackingState,
} from '../../lib';
import { useAppState } from '../../state/AppState';
import { Button, ReliabilityChip, ValueWithRange, s } from '../../components/ui';
import { colors, space } from '../../theme';

type Mode = 'distance' | 'room' | 'height' | 'reference';
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
  tooFewCorners: 'Marca al menos 3 esquinas para cerrar el contorno.',
  tooManyCorners: 'Máximo 12 esquinas.',
  shortWall: 'Hay una pared de menos de 30 cm. Elimina la última esquina y vuelve a marcarla.',
  crossingWalls: 'Hay paredes que se cruzan. Revisa el orden de las esquinas.',
};

export default function Scan() {
  const { id, mode: initialMode, realM: realParam } = useLocalSearchParams<{ id: string; mode?: Mode; realM?: string }>();
  const realM = realParam ? Number(realParam) : null;
  const db = useSQLiteContext();
  const { compat, settings } = useAppState();
  const [mode, setMode] = useState<Mode>(initialMode ?? 'distance');
  const [tracking, setTracking] = useState<{ state: TrackingState; cause: TrackingCause }>({ state: 'limited', cause: 'none' });
  const [reticle, setReticle] = useState<ReticleHit | null>(null);
  const [planes, setPlanes] = useState<Record<string, 'horizontal' | 'vertical'>>({});
  const [points, setPoints] = useState<Placed[]>([]);
  const [lastResult, setLastResult] = useState<{ valueM: number; score: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [manualH, setManualH] = useState('');
  const startedAt = useRef(Date.now());
  const lostSince = useRef<number | null>(null);
  const [lostLong, setLostLong] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Sin compatibilidad no se entra (RF-01).
  useEffect(() => {
    if (compat && !compat.canScan) { router.replace('/compat'); }
  }, [compat]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // RF-03: perdido > 5 s → ofrecer reinicio.
  useEffect(() => {
    if (tracking.state === 'lost') {
      lostSince.current ??= Date.now();
      setLostLong(Date.now() - lostSince.current > 5000);
    } else { lostSince.current = null; setLostLong(false); }
  }, [tracking.state, now]);

  const callbacks: ARCallbacks = useMemo(() => ({
    onTracking: (state, cause) => setTracking((t) => (t.state === state && t.cause === cause ? t : { state, cause })),
    onReticle: (hit) => setReticle(hit),
    onPlane: (pid, o) => setPlanes((p) => (p[pid] ? p : { ...p, [pid]: o })),
  }), []);

  const nH = Object.values(planes).filter((o) => o === 'horizontal').length;
  const nV = Object.values(planes).filter((o) => o === 'vertical').length;
  const scanReady = nH >= 1 && nV >= 2;
  const noPlanesHint = nH + nV === 0 && now - startedAt.current > 20000;

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
      // RF-12: calibración con objeto de referencia
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
    } else {
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
  }, [tracking.state, reticle, mode, points, db, id]);

  const undo = () => { setPoints((p) => p.slice(0, -1)); setLastResult(null); };

  const closeContour = async () => {
    const poly = points.map((x) => toFloor(x.p));
    const errors = validateContour(poly);
    if (errors.length) return setMessage(CONTOUR_MSG[errors[0].kind]);
    await saveCorners(db, id, points.map((x) => ({ ...toFloor(x.p), confidence: x.rel.score })));
    setPoints([]);
    setMode('height');
    setMessage('Contorno guardado. Ahora marca un punto en el piso y otro en el techo.');
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
    const ps = points.map((x) => x.p);
    const segs: [Point3, Point3][] = [];
    for (let i = 1; i < ps.length; i++) segs.push([ps[i - 1], ps[i]]);
    return { points: ps, segments: segs, draft: reticle?.position ?? null };
  }, [points, reticle]);

  const liveRel = reticle ? computeReliability({ tracking: tracking.state, surface: reticle.surface, cameraDistanceM: reticle.cameraDistanceM }) : null;
  const instruction =
    mode === 'reference' ? (points.length === 1 ? 'Marca el otro extremo de la referencia' : 'Marca un extremo del objeto de referencia')
      : mode === 'distance' ? (points.length === 1 ? 'Apunta al punto B y toca «Marcar»' : 'Apunta al punto A y toca «Marcar»')
      : mode === 'room' ? `Marca la esquina ${points.length + 1} (pared con piso)`
        : points.length === 0 ? 'Apunta al piso y toca «Marcar»' : 'Ahora apunta al techo, en la misma vertical';

  if (!compat?.canScan) return <View style={s.screen} />;

  return (
    <View style={s.screen}>
      <ARMeasureView callbacks={callbacks} drawing={drawing} resetSignal={resetSignal} />

      {/* Retícula */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderWidth: 2, borderColor: reticle ? colors.accent : colors.textMuted, borderRadius: 8 }} />

      <SafeAreaView pointerEvents="box-none" style={{ position: 'absolute', inset: 0, justifyContent: 'space-between', padding: space.md }}>
        <View style={{ gap: space.sm }}>
          <View style={[s.row, { backgroundColor: 'rgba(11,11,12,0.85)', borderRadius: 999, padding: space.sm }]}>
            <Text style={{ color: TRACK_COLOR[tracking.state], fontWeight: '700', fontSize: 15 }}>● Seguimiento: {TRACK_LABEL[tracking.state]}</Text>
            <Text style={s.muted}>Planos {nH}H · {nV}V{scanReady ? ' ✓' : ''}</Text>
          </View>
          {!!CAUSE_MSG[tracking.cause] && tracking.state !== 'good' && <Text style={banner}>{CAUSE_MSG[tracking.cause]}</Text>}
          {noPlanesHint && <Text style={banner}>No detectamos superficies. Mejora la luz, acércate a superficies con textura y mueve el teléfono más despacio.</Text>}
          {nH === 0 && !noPlanesHint && <Text style={banner}>Apunta al piso y mueve el teléfono despacio.</Text>}
          {nH > 0 && !scanReady && mode === 'room' && <Text style={banner}>Ahora apunta a una pared.</Text>}
          {lostLong && (
            <View style={{ gap: space.sm }}>
              <Text style={banner}>Se perdió el seguimiento. Tus mediciones guardadas se conservan.</Text>
              <Button label="Reiniciar escaneo" onPress={() => { setResetSignal((n) => n + 1); setPlanes({}); setPoints([]); startedAt.current = Date.now(); }} />
            </View>
          )}
        </View>

        <View style={{ gap: space.sm, backgroundColor: 'rgba(11,11,12,0.88)', borderRadius: 16, padding: space.md }}>
          <View style={[s.row]}>
            {mode === 'reference' && <Text style={[s.h2, { flex: 1 }]}>Calibración · referencia {realM ? formatLength(realM, 'cm', 3) : ''}</Text>}
            {mode !== 'reference' && (['distance', 'room', 'height'] as Mode[]).map((m) => (
              <Button key={m} label={m === 'distance' ? 'Distancia' : m === 'room' ? 'Habitación' : 'Altura'}
                variant={m === mode ? 'primary' : 'secondary'} style={{ flex: 1 }}
                onPress={() => { setMode(m); setPoints([]); setLastResult(null); setMessage(null); }} />
            ))}
          </View>
          <View style={s.row}>
            <Text style={[s.body, { flex: 1 }]}>{instruction}</Text>
            {liveRel && <ReliabilityChip score={liveRel.score} />}
          </View>
          {lastResult && <ValueWithRange valueM={lastResult.valueM} score={lastResult.score} unit={settings.unit} decimals={settings.decimals} />}
          {message && <Text style={{ color: colors.warn, fontSize: 15 }}>{message}</Text>}
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
          <Button label="Ver resultados" variant="secondary" onPress={() => router.replace(`/project/${id}`)} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const banner = { color: colors.text, backgroundColor: 'rgba(11,11,12,0.85)', borderRadius: 12, padding: 10, fontSize: 15 } as const;
