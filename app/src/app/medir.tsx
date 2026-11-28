/**
 * Medición de un producto con realidad aumentada (ARCore).
 *  - AUTO: apunta la retícula a la cara superior del producto y toca «Seleccionar». ARCore la detecta
 *    como plano: largo y ancho salen de su contorno y el alto de la distancia a la superficie de apoyo.
 *  - PUNTOS: marca dos puntos por arista (largo, ancho, alto) con la retícula.
 *  - IA: identifica el producto en la imagen (nombre, categoría, frágil) y da una estimación de respaldo,
 *    que se dibuja en AR como una caja sobre el punto apuntado.
 * Solo se mide entre MIN_DISTANCE_M y MAX_DISTANCE_M de la cámara; una guía inicial explica cómo apuntar.
 * Con las tres medidas, la app pide la caja recomendada y la dibuja en AR alrededor del producto.
 */
import { RequireAuth } from '../components/RoleGate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import type { VisionObject } from '../api/types';
import { ARProductView, type ARCallbacks, type ARDrawing, type ARHandle, type BoxGhost, type DetectedPlane, type ReticleHit } from '../ar/ARProductView';
import { checkARSupport, requestCamera, type ARSupport } from '../ar/compat';
import { Button } from '../components/ui';
import { LoadingDots } from '../components/motion';
import { toJpegBase64 } from '../lib/image';
import { ensureAiConsent } from '../lib/consent';
import {
  aiBoxBase, distance3, distanceStatus, heightAboveSupport, MAX_DISTANCE_M, MIN_DISTANCE_M, MIN_SEPARATION_M, normalizeDims, reliability, reliabilityLabel, toCm,
  type Dim, type HPlane, type Point3, type TrackingState,
} from '../lib/measure';
import { measureBus } from '../state/measureBus';
import { colors, fonts, space } from '../theme';

type Mode = 'auto' | 'puntos';
const DIM_LABEL: Record<Dim, string> = { length: 'Largo', width: 'Ancho', height: 'Alto' };
const DIMS: Dim[] = ['length', 'width', 'height'];
const TRACK_COLOR: Record<TrackingState, string> = { good: '#3BB273', limited: '#E0A100', lost: colors.red };
const CAUSE: Record<string, string> = { motion: 'Mueve el teléfono más despacio', features: 'Apunta a una superficie con textura', light: 'Necesitas más luz', none: '' };

export default function MedirScreen() {
  return <RequireAuth><Medir /></RequireAuth>;
}

function Medir() {
  const { purpose } = useLocalSearchParams<{ purpose?: string }>();
  const [support, setSupport] = useState<ARSupport | 'checking'>('checking');

  useEffect(() => {
    if (Platform.OS === 'web') { router.replace({ pathname: '/medir-foto', params: purpose ? { purpose } : {} }); return; }
    (async () => {
      const s = await checkARSupport();
      if (s === 'supported') {
        const ok = await requestCamera();
        setSupport(ok ? 'supported' : 'unknown');
      } else setSupport(s);
    })();
  }, [purpose]);

  if (support === 'checking') {
    return <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 12 }}><ActivityIndicator color={colors.red} size="large" /><Text style={{ color: colors.paper }}>Preparando la cámara AR…</Text></View>;
  }
  if (support !== 'supported') {
    const msg = support === 'needsInstall'
      ? 'Tu teléfono es compatible, pero necesita instalar o actualizar «Servicios de Google Play para AR».'
      : support === 'unsupported' ? 'Este teléfono no es compatible con ARCore.' : 'No se pudo iniciar la realidad aumentada (¿permiso de cámara?).';
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
        <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 30, textTransform: 'uppercase' }}>Sin realidad aumentada</Text>
        <Text style={{ color: colors.paper3, fontSize: 16 }}>{msg} Puedes medir con una foto y una tarjeta de referencia.</Text>
        <Button label="Medir con foto" onPress={() => router.replace({ pathname: '/medir-foto', params: purpose ? { purpose } : {} })} />
        <Button label="Volver" variant="outline" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  return <ARMeasure purpose={purpose} />;
}

function ARMeasure({ purpose }: { purpose?: string }) {
  const [mode, setMode] = useState<Mode>('auto');
  const [tracking, setTracking] = useState<TrackingState>('limited');
  const [cause, setCause] = useState('none');
  const [reticle, setReticle] = useState<ReticleHit | null>(null);
  const [planeTick, setPlaneTick] = useState(0);
  const planes = useRef(new Map<string, DetectedPlane>());
  const [selId, setSelId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<Dim, number | null>>({ length: null, width: null, height: null }); // cm
  const [scores, setScores] = useState<number[]>([]);
  const [active, setActive] = useState<Dim>('length');
  const [pts, setPts] = useState<Point3[]>([]);
  const [segs, setSegs] = useState<{ a: Point3; b: Point3; label: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [ai, setAi] = useState<{ busy: boolean; list: VisionObject[] | null; chosen: VisionObject | null; error: string | null }>({ busy: false, list: null, chosen: null, error: null });
  const [ghost, setGhost] = useState<(BoxGhost & { fill: number; name: string }) | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [aiBase, setAiBase] = useState<ReticleHit | null>(null);
  const handle = useRef<ARHandle | null>(null);
  const lastUi = useRef(0);

  const callbacks: ARCallbacks = useMemo(() => ({
    onTracking: (s, c) => { setTracking(s); setCause(c); },
    onReticle: (hit) => {
      const t = Date.now();
      if (t - lastUi.current >= 90) { lastUi.current = t; setReticle(hit); }
    },
    onPlane: (p) => { planes.current.set(p.id, p); setPlaneTick((n) => n + 1); },
  }), []);

  const hPlanes: HPlane[] = useMemo(
    () => [...planes.current.values()].filter((p) => p.kind === 'floor'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planeTick],
  );
  const selPlane = selId ? planes.current.get(selId) ?? null : null;

  // Si el plano seleccionado se refina, se actualizan largo/ancho/alto en vivo.
  useEffect(() => {
    if (!selPlane || mode !== 'auto') return;
    const h = heightAboveSupport(selPlane, hPlanes);
    setValues((v) => ({ length: toCm(selPlane.lengthM), width: toCm(selPlane.widthM), height: h != null ? toCm(h) : v.height }));
  }, [selPlane, hPlanes, mode, planeTick]);

  const done = values.length != null && values.width != null && values.height != null;
  const dist = reticle?.cameraDistanceM ?? null;
  const dStat = dist == null ? null : distanceStatus(dist);
  const RANGE = `${Math.round(MIN_DISTANCE_M * 100)} y ${Math.round(MAX_DISTANCE_M * 100)} cm`;
  // El aviso de distancia se muestra en vivo (hint), no como mensaje fijo: así desaparece en cuanto
  // la distancia vuelve a estar en rango y no contradice al indicador de arriba.
  const outOfRange = () => dStat === 'cerca' || dStat === 'lejos';

  // Caja recomendada (servicio de embalaje) para dibujarla en AR.
  useEffect(() => {
    if (!done) { setGhost(null); return; }
    const t = setTimeout(() => {
      api.recommend([{ name: ai.chosen?.nombre ?? 'Producto', length: values.length!, width: values.width!, height: values.height!, weight: 0.3, qty: 1, fragile: ai.chosen?.fragil ?? false }])
        .then((r) => {
          const b = r.packages[0]?.box;
          if (!b) return;
          setGhost({ lengthM: b.length / 100, widthM: b.width / 100, heightM: b.height / 100, label: `${b.name.toUpperCase()} ${b.length}×${b.width}×${b.height}`, fill: r.packages[0].fillPct, name: b.name });
        })
        .catch(() => setGhost(null));
    }, 600);
    return () => clearTimeout(t);
  }, [done, values.length, values.width, values.height, ai.chosen]);

  const fmt = (c: number | null) => (c == null ? '—' : `${c.toString().replace('.', ',')}`);

  const drawing: ARDrawing = useMemo(() => {
    const draft = mode === 'puntos' ? reticle?.position ?? null : null;
    const segments: [Point3, Point3][] = segs.map((s) => [s.a, s.b]);
    if (mode === 'puntos' && pts.length === 1 && reticle) segments.push([pts[0], reticle.position]);
    const labels = segs.map((s) => ({ at: { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 + 0.02, z: (s.a.z + s.b.z) / 2 }, text: s.label }));
    let product = null;
    if (selPlane && mode === 'auto') {
      const h = heightAboveSupport(selPlane, hPlanes);
      product = {
        planeId: selPlane.id, rect: selPlane.rect, lengthLabel: `${fmt(toCm(selPlane.lengthM))} CM`, widthLabel: `${fmt(toCm(selPlane.widthM))} CM`,
        drop: h != null ? { dy: -h, label: `${fmt(toCm(h))} CM` } : null,
      };
    }
    const surfaces = [...planes.current.values()].filter((p) => p.id !== selId).map((p) => ({ id: p.id, outline: p.outline }));
    const est = ai.chosen?.estimado;
    const aiBox = !product && aiBase && est?.largo && est.ancho && est.alto
      ? { base: aiBoxBase(aiBase.position, aiBase.cameraPosition, hPlanes, { widthM: est.ancho / 100, heightM: est.alto / 100 }), lengthM: est.largo / 100, widthM: est.ancho / 100, heightM: est.alto / 100, label: `IA ${fmt(est.largo)}×${fmt(est.ancho)}×${fmt(est.alto)} CM` }
      : null;
    return { points: pts, segments, labels, draft, product, ghost, surfaces, aiBox };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, segs, reticle, mode, selPlane, hPlanes, ghost, planeTick, selId, ai.chosen, aiBase]);

  const nextMissing = (v: Record<Dim, number | null>, from: Dim): Dim => DIMS.find((d) => v[d] == null && d !== from) ?? from;

  /** AUTO: toma el plano horizontal más pequeño bajo la retícula (la cara superior del producto). */
  const selectTop = () => {
    setMessage(null);
    if (!reticle) return setMessage('Apunta la retícula a la cara superior del producto.');
    if (outOfRange()) return;
    let best: DetectedPlane | null = null;
    for (const p of planes.current.values()) {
      if (p.kind !== 'floor') continue;
      if (Math.abs(reticle.position.y - p.y) > 0.05) continue;
      if (Math.hypot(reticle.position.x - p.cx, reticle.position.z - p.cz) > Math.hypot(p.lengthM, p.widthM) / 2 + 0.04) continue;
      if (!best || p.lengthM * p.widthM < best.lengthM * best.widthM) best = p;
    }
    if (!best) return setMessage('Aún no se detecta esa cara. Muévete despacio alrededor del producto.');
    if (best.lengthM > 1.5) return setMessage('Eso parece el piso o una mesa grande. Apunta a la cara superior del producto.');
    setSelId(best.id);
    setScores([reliability(tracking, 'plane', reticle.cameraDistanceM)]);
    const h = heightAboveSupport(best, hPlanes);
    if (h == null) {
      setMessage('No veo la superficie de apoyo: mide el alto con puntos.');
      setMode('puntos'); setActive('height'); setPts([]);
    }
  };

  /** PUNTOS: marca un punto; con dos se completa la medida activa. */
  const placePoint = () => {
    setMessage(null);
    if (!reticle || tracking === 'lost') return setMessage('Sin seguimiento: mueve el teléfono despacio.');
    if (outOfRange()) return;
    const p = reticle.position;
    if (pts.length === 0) { setPts([p]); return; }
    const d = distance3(pts[0], p);
    if (d < MIN_SEPARATION_M) return setMessage('Los puntos están a menos de 1 cm.');
    const val = toCm(d);
    const next = { ...values, [active]: val };
    setValues(next);
    setScores((s) => [...s, reliability(tracking, reticle.surface, reticle.cameraDistanceM)]);
    setSegs((s) => [...s.filter((x) => !x.label.startsWith(DIM_LABEL[active].toUpperCase())), { a: pts[0], b: p, label: `${DIM_LABEL[active].toUpperCase()} ${fmt(val)}` }]);
    setPts([]);
    setActive(nextMissing(next, active));
  };

  const identify = async () => {
    if (!(await ensureAiConsent())) return;
    setAi((a) => ({ ...a, busy: true, error: null }));
    try {
      setAiBase(reticle ?? null);
      const uri = await handle.current?.capture();
      if (!uri) throw new Error('No se pudo tomar la imagen de la cámara.');
      const b64 = await toJpegBase64(uri);
      const r = await api.identify(b64);
      setAi({ busy: false, list: r.objetos, chosen: r.objetos[0] ?? null, error: r.objetos.length ? null : 'No reconocí un producto. Acércate y enfoca solo el producto.' });
    } catch (e: any) {
      setAi((a) => ({ ...a, busy: false, error: e.message }));
    }
  };

  const applyAiEstimate = () => {
    const e = ai.chosen?.estimado;
    if (!e) return;
    setValues((v) => ({ length: v.length ?? e.largo, width: v.width ?? e.ancho, height: v.height ?? e.alto }));
    setScores((s) => [...s, 0.35]);
  };

  const resetAll = () => {
    setAiBase(null); setSelId(null); setValues({ length: null, width: null, height: null }); setScores([]); setPts([]); setSegs([]); setActive('length'); setGhost(null); setMessage(null);
  };

  const confirm = () => {
    if (!done) return;
    const conf = scores.length ? Math.min(...scores) : 0.5;
    const n = normalizeDims({ length: values.length!, width: values.width!, height: values.height! });
    measureBus.put({ ...n, method: 'ar', confidence: conf, name: ai.chosen?.nombre, category: ai.chosen?.categoria, fragile: ai.chosen?.fragil, purpose });
    router.back();
  };

  const conf = scores.length ? Math.min(...scores) : null;
  const hint = message
    ?? (ai.busy ? 'La IA está analizando la imagen…' : null)
    ?? (dStat === 'cerca' ? `Muy cerca: aléjate (entre ${RANGE})` : dStat === 'lejos' ? `Muy lejos (${Math.round((dist ?? 0) * 100)} cm): acércate. Si el producto es alto o delgado, apunta a la mesa junto a su base.` : null)
    ?? (tracking !== 'good' && CAUSE[cause] ? CAUSE[cause]
      : mode === 'auto'
        ? (selPlane ? (done ? 'Listo. Revisa la caja roja sugerida y confirma.' : 'Midiendo… mantén el teléfono quieto') : planes.current.size ? 'Apunta la retícula a la cara superior del producto y toca SELECCIONAR' : 'Mueve el teléfono despacio sobre la mesa para detectar superficies')
        : `${DIM_LABEL[active]}: ${pts.length === 0 ? 'apunta al primer extremo y marca' : 'apunta al otro extremo y marca'}`);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ARProductView callbacks={callbacks} drawing={drawing} handleRef={handle} resetSignal={resetSignal} />
      {/* Retícula */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 34, height: 34, marginLeft: -17, marginTop: -17, borderWidth: 3, borderColor: reticle ? colors.red : 'rgba(255,255,255,0.7)', transform: [{ rotate: '45deg' }] }} />

      <SafeAreaView pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' }}>
        {/* Barra superior */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={sq}>
            <Text style={{ color: colors.paper, fontSize: 24, fontFamily: fonts.display }}>←</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', flex: 1, borderWidth: 2, borderColor: colors.paper }}>
            {(['auto', 'puntos'] as Mode[]).map((m) => (
              <Pressable key={m} accessibilityRole="button" onPress={() => { setMode(m); setPts([]); setMessage(null); }}
                style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === m ? colors.red : 'rgba(20,20,20,0.75)' }}>
                <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 15, letterSpacing: 1 }}>{m === 'auto' ? 'AUTO' : 'PUNTOS'}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cómo medir" onPress={() => setShowGuide(true)} style={sq}>
            <Text style={{ color: colors.paper, fontSize: 22, fontFamily: fonts.display }}>?</Text>
          </Pressable>
          <View accessibilityLabel={`Seguimiento ${tracking}`} style={[sq, { backgroundColor: 'rgba(20,20,20,0.75)' }]}>
            <View style={{ width: 16, height: 16, backgroundColor: TRACK_COLOR[tracking], transform: [{ rotate: '45deg' }] }} />
          </View>
        </View>

        {dist != null && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 76, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: dStat === 'ok' ? '#3BB273' : colors.red }}>
            <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 16, letterSpacing: 1 }}>
              {Math.round(dist * 100)} CM · {dStat === 'ok' ? 'DISTANCIA CORRECTA' : dStat === 'cerca' ? 'ALÉJATE' : 'ACÉRCATE'}
            </Text>
          </View>
        )}

        {/* Panel inferior */}
        <View style={{ backgroundColor: 'rgba(20,20,20,0.92)', borderTopWidth: 6, borderTopColor: colors.red, padding: space.md, gap: space.sm }}>
          <Text style={{ color: message || (dStat && dStat !== 'ok') ? '#FFB4AE' : colors.paper, fontSize: 15 }} numberOfLines={2}>{hint}</Text>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {DIMS.map((d) => {
              const on = mode === 'puntos' && active === d;
              return (
                <Pressable key={d} accessibilityRole="button" accessibilityLabel={`${DIM_LABEL[d]} ${values[d] ?? 'sin medir'} centímetros`}
                  onPress={() => { setActive(d); if (mode !== 'puntos') setMode('puntos'); setPts([]); }}
                  style={{ flex: 1, borderWidth: 3, borderColor: on ? colors.red : colors.paper, padding: 6, backgroundColor: values[d] != null ? colors.paper : 'transparent' }}>
                  <Text style={{ fontFamily: fonts.displayMedium, fontSize: 12, letterSpacing: 1, color: values[d] != null ? colors.grey : colors.paper3 }}>{DIM_LABEL[d].toUpperCase()}</Text>
                  <Text style={{ fontFamily: fonts.display, fontSize: 22, color: values[d] != null ? colors.ink : colors.paper }}>{fmt(values[d])}<Text style={{ fontSize: 13 }}> cm</Text></Text>
                </Pressable>
              );
            })}
          </View>

          {ghost && done && (
            <Text style={{ color: colors.paper, fontSize: 14 }}>
              Caja sugerida: <Text style={{ fontFamily: fonts.display, color: '#FF6B62' }}>{ghost.name}</Text> · {ghost.fill}% llena{conf != null ? ` · confiabilidad ${reliabilityLabel(conf)}` : ''}
            </Text>
          )}

          {(ai.list || ai.error) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {ai.error && <Text style={{ color: '#FFB4AE', fontSize: 13 }}>{ai.error}</Text>}
              {ai.list?.map((o, i) => (
                <Pressable key={i} onPress={() => setAi((a) => ({ ...a, chosen: o }))}
                  style={{ paddingHorizontal: 10, height: 34, justifyContent: 'center', backgroundColor: ai.chosen === o ? colors.red : 'transparent', borderWidth: 2, borderColor: colors.paper }}>
                  <Text style={{ color: colors.paper, fontWeight: '700' }}>{o.nombre}{o.fragil ? ' · frágil' : ''}</Text>
                </Pressable>
              ))}
              {ai.chosen?.estimado?.largo && !done && (
                <Pressable onPress={applyAiEstimate} style={{ paddingHorizontal: 10, height: 34, justifyContent: 'center', backgroundColor: colors.paper }}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>Usar estimación IA</Text>
                </Pressable>
              )}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {mode === 'auto'
              ? <Button label={selPlane ? 'Reseleccionar' : 'Seleccionar'} icon="gesture-tap" style={{ flex: 1 }} onPress={selectTop} disabled={!reticle} />
              : <Button label={pts.length ? 'Marcar fin' : 'Marcar inicio'} icon="crosshairs-gps" style={{ flex: 1 }} onPress={placePoint} disabled={!reticle} />}
            {ai.busy
              ? <View accessibilityLabel="La IA está analizando" style={{ minWidth: 64, height: 44, borderWidth: 3, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}><LoadingDots /></View>
              : <Button label="IA" variant="outline" small onPress={identify} style={{ alignSelf: 'center' }} />}
            <Button label="↺" variant="outline" small onPress={() => { resetAll(); planes.current.clear(); setPlaneTick((n) => n + 1); setResetSignal((n) => n + 1); }} style={{ alignSelf: 'center' }} />
          </View>
          <Button label="Usar estas medidas" variant="ink" onPress={confirm} disabled={!done} />
          <Text style={{ color: colors.paper3, fontSize: 12, textAlign: 'center' }}>Las medidas son estimaciones: confírmalas antes de despachar.</Text>
        </View>
      </SafeAreaView>
      {showGuide && <MeasureGuide onClose={() => setShowGuide(false)} />}
    </View>
  );
}

const TIPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: `Distancia: ${Math.round(MIN_DISTANCE_M * 100)} a ${Math.round(MAX_DISTANCE_M * 100)} cm`, body: 'Ubica el teléfono a un brazo de distancia del producto. Arriba verás la distancia en vivo: en verde puedes medir.' },
  { n: '2', title: 'Apunta en diagonal, desde arriba', body: 'Inclina el teléfono unos 45° mirando hacia el producto, de modo que veas su cara superior y uno de sus lados.' },
  { n: '3', title: 'Detecta la superficie primero', body: 'Pon el producto sobre una mesa o el piso con textura (no vidrio ni superficies lisas y brillantes) y mueve el teléfono despacio unos segundos.' },
  { n: '4', title: 'Buena luz y pulso firme', body: 'Mide con luz pareja, sin contraluz. Mantén el teléfono quieto al seleccionar o marcar puntos.' },
];

/** Guía inicial: desde qué distancia y cómo apuntar la cámara para medir mejor. */
function MeasureGuide({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,20,0.94)' }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }}>
          <Text style={{ color: colors.paper3, fontFamily: fonts.displayMedium, letterSpacing: 2, fontSize: 14 }}>ANTES DE MEDIR</Text>
          <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 34, lineHeight: 38, textTransform: 'uppercase' }}>Cómo apuntar la cámara</Text>
          {TIPS.map((t) => (
            <View key={t.n} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
              <View style={{ width: 36, height: 36, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 20 }}>{t.n}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 18, textTransform: 'uppercase' }}>{t.title}</Text>
                <Text style={{ color: colors.paper3, fontSize: 15, lineHeight: 21 }}>{t.body}</Text>
              </View>
            </View>
          ))}
          <Button label="Entendido, medir" icon="check" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const sq = { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.paper, backgroundColor: 'rgba(20,20,20,0.75)' } as const;
