/**
 * Medición con foto + objeto de referencia (web y teléfonos sin ARCore).
 * Foto superior: referencia → largo → ancho. Foto lateral: referencia → alto.
 * La escala sale de la referencia (p. ej. una tarjeta de 8,56 cm) apoyada junto al producto.
 */
import { useMemo, useState } from 'react';
import { Image, Platform, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { api } from '../api/client';
import type { VisionObject } from '../api/types';
import { Body, Button, Card, ErrorBox, Header, Label, Row, Screen, SectionTitle, Segmented, Tag } from '../components/ui';
import { normalizeDims, photoMeasureCm, REFERENCES, type Px } from '../lib/measure';
import { toJpegBase64 } from '../lib/image';
import { ensureAiConsent } from '../lib/consent';
import { measureBus } from '../state/measureBus';
import { colors, fonts, space } from '../theme';

type Shot = 'top' | 'side';
const STEPS: Record<Shot, { key: string; label: string }[]> = {
  top: [
    { key: 'ref', label: 'Toca los dos extremos de la referencia' },
    { key: 'length', label: 'Toca los dos extremos del LARGO del producto' },
    { key: 'width', label: 'Toca los dos extremos del ANCHO del producto' },
  ],
  side: [
    { key: 'ref', label: 'Toca los dos extremos de la referencia' },
    { key: 'height', label: 'Toca la base y la parte más alta del producto (ALTO)' },
  ],
};
const PAIR_COLOR: Record<string, string> = { ref: colors.ink, length: colors.red, width: '#1F5FA8', height: colors.ok };

interface ShotState { uri: string | null; w: number; h: number; taps: Px[] }
const empty: ShotState = { uri: null, w: 0, h: 0, taps: [] };

export default function MedirFoto() {
  const { purpose } = useLocalSearchParams<{ purpose?: string }>();
  const [shot, setShot] = useState<Shot>('top');
  const [shots, setShots] = useState<Record<Shot, ShotState>>({ top: empty, side: empty });
  const [refId, setRefId] = useState<string>(REFERENCES[0].id);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ busy: boolean; obj: VisionObject | null; error: string | null }>({ busy: false, obj: null, error: null });
  const ref = REFERENCES.find((r) => r.id === refId)!;
  const cur = shots[shot];
  const steps = STEPS[shot];
  const stepIdx = Math.min(Math.floor(cur.taps.length / 2), steps.length);

  const pick = async (camera: boolean) => {
    setError(null);
    try {
      if (camera && Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setError('Necesitamos permiso de cámara para tomar la foto.'); return; }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
      const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setShots((s) => ({ ...s, [shot]: { uri: a.uri, w: a.width || 1, h: a.height || 1, taps: [] } }));
    } catch (e: any) { setError(e?.message ?? 'No se pudo abrir la cámara'); }
  };

  // Imagen ajustada al ancho disponible (misma escala en x e y: las proporciones se conservan).
  const disp = useMemo(() => {
    if (!cur.uri || !box.w) return { w: 0, h: 0 };
    const maxH = 460;
    let w = box.w, h = (cur.h / cur.w) * w;
    if (h > maxH) { h = maxH; w = (cur.w / cur.h) * h; }
    return { w, h };
  }, [cur, box.w]);

  const onTap = (e: GestureResponderEvent) => {
    if (stepIdx >= steps.length) return;
    const ne: any = e.nativeEvent;
    const x = Platform.OS === 'web' && ne.offsetX != null ? ne.offsetX : ne.locationX;
    const y = Platform.OS === 'web' && ne.offsetY != null ? ne.offsetY : ne.locationY;
    setShots((s) => ({ ...s, [shot]: { ...s[shot], taps: [...s[shot].taps, { x, y }] } }));
  };

  const measure = (s: ShotState, key: string): number | null => {
    const i = STEPS[s === shots.top ? 'top' : 'side'].findIndex((x) => x.key === key);
    const t = s.taps;
    if (i < 0 || t.length < 2 * i + 2 || t.length < 2) return null;
    return photoMeasureCm(t[0], t[1], ref.cm, t[2 * i], t[2 * i + 1]);
  };
  const L = measure(shots.top, 'length'), W = measure(shots.top, 'width'), H = measure(shots.side, 'height');
  const done = L != null && W != null && H != null;

  const identify = async () => {
    const uri = shots.top.uri ?? shots.side.uri;
    if (!uri || !(await ensureAiConsent())) return;
    setAi({ busy: true, obj: null, error: null });
    try {
      const r = await api.identify(await toJpegBase64(uri));
      setAi({ busy: false, obj: r.objetos[0] ?? null, error: r.objetos[0] ? null : 'No reconocí un producto en la foto.' });
    } catch (e: any) { setAi({ busy: false, obj: null, error: e.message }); }
  };

  const confirm = () => {
    if (!done) return;
    const n = normalizeDims({ length: L!, width: W!, height: H! });
    measureBus.put({ ...n, method: 'foto', confidence: 0.6, name: ai.obj?.nombre, category: ai.obj?.categoria, fragile: ai.obj?.fragil, purpose });
    router.back();
  };

  return (
    <Screen header={<Header title="Medir con foto" kicker="Referencia + 2 fotos" onBack={() => router.back()} />}>
      <Card accent={colors.red}>
        <Body>Pon junto al producto, <Text style={{ fontWeight: '800' }}>sobre la misma superficie</Text>, un objeto de tamaño conocido. Toma la foto de frente y perpendicular (sin inclinar).</Body>
        <Label>Referencia</Label>
        <Row wrap style={{ gap: space.sm }}>
          {REFERENCES.map((r) => <Button key={r.id} small label={`${r.label.split(' (')[0]} · ${String(r.cm).replace('.', ',')} cm`} variant={r.id === refId ? 'ink' : 'outline'} onPress={() => setRefId(r.id)} />)}
        </Row>
      </Card>

      <Segmented value={shot} onChange={setShot} options={[
        { value: 'top', label: `1 · Desde arriba${L != null && W != null ? ' ✓' : ''}` },
        { value: 'side', label: `2 · De lado${H != null ? ' ✓' : ''}` },
      ]} />

      <Row>
        <Button label={cur.uri ? 'Otra foto' : 'Tomar foto'} icon="●" style={{ flex: 1 }} onPress={() => pick(true)} />
        <Button label="Galería" variant="outline" onPress={() => pick(false)} />
      </Row>
      <ErrorBox message={error} />

      <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: 0 })} style={{ width: '100%' }}>
        {cur.uri && disp.w > 0 && (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 18, color: stepIdx < steps.length ? colors.red : colors.ok, textTransform: 'uppercase' }}>
              {stepIdx < steps.length ? `${stepIdx + 1}/${steps.length} · ${steps[stepIdx].label}` : 'Foto lista ✓'}
            </Text>
            <Pressable onPress={onTap} style={{ width: disp.w, height: disp.h, alignSelf: 'center', borderWidth: 3, borderColor: colors.ink }}>
              <Image source={{ uri: cur.uri }} style={{ width: disp.w - 6, height: disp.h - 6 }} resizeMode="stretch" />
              <Svg width={disp.w - 6} height={disp.h - 6} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
                {cur.taps.map((p, i) => {
                  const key = steps[Math.floor(i / 2)]?.key ?? 'ref';
                  const c = PAIR_COLOR[key];
                  const prev = i % 2 === 1 ? cur.taps[i - 1] : null;
                  return (
                    <G key={i}>
                      {prev && <Line x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke={c} strokeWidth={4} />}
                      <Circle cx={p.x} cy={p.y} r={7} fill={c} stroke={colors.paper} strokeWidth={2} />
                    </G>
                  );
                })}
              </Svg>
            </Pressable>
            <Row>
              <Button small variant="outline" label="Deshacer toque" style={{ flex: 1 }} disabled={!cur.taps.length}
                onPress={() => setShots((s) => ({ ...s, [shot]: { ...s[shot], taps: s[shot].taps.slice(0, -1) } }))} />
              {stepIdx >= steps.length && shot === 'top' && <Button small label="Siguiente: de lado" style={{ flex: 1 }} onPress={() => setShot('side')} />}
            </Row>
          </View>
        )}
      </View>

      <SectionTitle>Resultado</SectionTitle>
      <Row>
        {[['Largo', L], ['Ancho', W], ['Alto', H]].map(([k, v]) => (
          <View key={k as string} style={{ flex: 1, borderWidth: 3, borderColor: colors.ink, padding: space.sm, backgroundColor: v != null ? colors.paper : colors.paper2 }}>
            <Label>{k as string}</Label>
            <Text style={{ fontFamily: fonts.display, fontSize: 24 }}>{v != null ? String(v).replace('.', ',') : '—'}<Text style={{ fontSize: 13 }}> cm</Text></Text>
          </View>
        ))}
      </Row>
      <Button label={ai.busy ? 'Identificando…' : 'Identificar producto con IA'} variant="outline" onPress={identify} disabled={ai.busy || (!shots.top.uri && !shots.side.uri)} />
      {ai.obj && <Row wrap style={{ gap: 6 }}><Tag label={ai.obj.nombre} color={colors.red} /><Tag label={ai.obj.categoria} />{ai.obj.fragil && <Tag label="Frágil" color={colors.warn} />}</Row>}
      {ai.error && <Body muted>{ai.error}</Body>}
      <Button label="Usar estas medidas" variant="ink" onPress={confirm} disabled={!done} />
      <Body muted style={{ fontSize: 13 }}>Precisión típica ±5 %: depende de que la referencia y el producto estén en el mismo plano. Para mayor precisión usa la medición AR en la app Android.</Body>
    </Screen>
  );
}
