import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../api/client';
import type { MeasuredBy } from '../../api/types';
import { RoleGate } from '../../components/RoleGate';
import { Body, Button, Card, ErrorBox, Field, Header, Loading, Row, Screen, SectionTitle, Tag, Toggle } from '../../components/ui';
import { METHOD_LABEL } from '../../lib/format';
import { reliabilityLabel } from '../../lib/measure';
import { measureBus } from '../../state/measureBus';
import { colors, fonts, space } from '../../theme';

const CATEGORIES = ['Ropa', 'Calzado', 'Hogar', 'Belleza', 'Tecnología', 'Accesorios', 'Papelería', 'Alimentos', 'Juguetes', 'Otro'];

export default function ProductoScreen() {
  return <RoleGate role="tienda"><ProductoForm /></RoleGate>;
}

function ProductoForm() {
  const { id, medir } = useLocalSearchParams<{ id: string; medir?: string }>();
  const isNew = id === 'nuevo';
  const [loading, setLoading] = useState(!isNew);
  const [f, setF] = useState({ name: '', sku: '', category: '', length: '', width: '', height: '', weight: '0.2', price: '' });
  const [fragile, setFragile] = useState(false);
  const [method, setMethod] = useState<MeasuredBy>('manual');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoOpened = useRef(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v.replace(',', k === 'name' || k === 'sku' || k === 'category' ? ',' : '.') }));

  useEffect(() => {
    if (isNew) return;
    api.products().then((ps) => {
      const p = ps.find((x) => x.id === id);
      if (!p) { setError('Producto no encontrado'); return; }
      setF({ name: p.name, sku: p.sku ?? '', category: p.category ?? '', length: String(p.length_cm), width: String(p.width_cm), height: String(p.height_cm), weight: String(p.weight_kg), price: String(p.price || '') });
      setFragile(p.fragile); setMethod(p.measured_by); setConfidence(p.confidence);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id, isNew]);

  const openMeasure = useCallback((kind: 'ar' | 'foto') => {
    router.push(kind === 'ar' && Platform.OS !== 'web' ? '/medir' : '/medir-foto');
  }, []);

  // Al volver de medir, se toma el resultado.
  useFocusEffect(useCallback(() => {
    const r = measureBus.take();
    if (r) {
      setF((x) => ({
        ...x, length: String(r.length), width: String(r.width), height: String(r.height),
        name: x.name || r.name || '', category: x.category || r.category || '',
      }));
      if (r.fragile) setFragile(true);
      setMethod(r.method); setConfidence(r.confidence);
    } else if (isNew && medir && !autoOpened.current) {
      autoOpened.current = true;
      openMeasure('ar');
    }
  }, [isNew, medir, openMeasure]));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = {
        name: f.name, sku: f.sku || null, category: f.category || null,
        length_cm: Number(f.length), width_cm: Number(f.width), height_cm: Number(f.height),
        weight_kg: Number(f.weight), price: Number(f.price) || 0, fragile, measured_by: method, confidence,
      };
      if (isNew) await api.createProduct(body); else await api.updateProduct(id, body);
      router.back();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = () => {
    const go = async () => { try { await api.deleteProduct(id); router.back(); } catch (e: any) { setError(e.message); } };
    if (Platform.OS === 'web') { if (globalThis.confirm?.('¿Eliminar este producto?')) void go(); return; }
    Alert.alert('Eliminar producto', '¿Seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: go }]);
  };

  const vol = Number(f.length) * Number(f.width) * Number(f.height);
  const volKg = vol > 0 ? vol / 5000 : 0;

  return (
    <Screen header={<Header title={isNew ? 'Nuevo producto' : 'Producto'} kicker="Catálogo" onBack={() => router.back()} />}>
      {loading ? <Loading /> : (
        <>
          <SectionTitle>Medidas</SectionTitle>
          <Row>
            <Button label={Platform.OS === 'web' ? 'Medir con foto' : 'Medir con AR'} icon="cube-scan" style={{ flex: 1 }} onPress={() => openMeasure('ar')} />
            {Platform.OS !== 'web' && <Button label="Con foto" variant="outline" onPress={() => openMeasure('foto')} />}
          </Row>
          <Row wrap style={{ gap: 6 }}>
            <Tag label={METHOD_LABEL[method]} color={method === 'ar' ? colors.red : colors.grey} />
            {confidence != null && <Tag label={`Confiabilidad ${reliabilityLabel(confidence)}`} color={confidence >= 0.75 ? colors.ok : colors.warn} />}
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <Field required label="Largo cm" value={f.length} onChangeText={(v) => { set('length')(v); setMethod('manual'); }} keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Field required label="Ancho cm" value={f.width} onChangeText={(v) => { set('width')(v); setMethod('manual'); }} keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Field required label="Alto cm" value={f.height} onChangeText={(v) => { set('height')(v); setMethod('manual'); }} keyboardType="decimal-pad" style={{ flex: 1 }} />
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <Field required label="Peso kg" value={f.weight} onChangeText={set('weight')} keyboardType="decimal-pad" style={{ flex: 1 }} hint="Usa una gramera: la cámara no pesa" />
            <Field label="Precio $" value={f.price} onChangeText={set('price')} keyboardType="number-pad" style={{ flex: 1 }} hint="Para el seguro" />
          </Row>
          {vol > 0 && (
            <Card style={{ backgroundColor: colors.ink }} shadow={colors.red}>
              <Text style={{ color: colors.paper3, fontFamily: fonts.displayMedium, letterSpacing: 1 }}>PESO VOLUMÉTRICO DEL PRODUCTO</Text>
              <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 28 }}>{volKg.toFixed(2).replace('.', ',')} kg</Text>
              <Text style={{ color: colors.paper3, fontSize: 13 }}>Las transportadoras cobran el mayor entre peso real y volumétrico (L×A×H ÷ 5000).</Text>
            </Card>
          )}

          <SectionTitle>Datos</SectionTitle>
          <Field required label="Nombre" value={f.name} onChangeText={(v) => setF((x) => ({ ...x, name: v }))} placeholder="Vela aromática lavanda" />
          <Field label="SKU (opcional)" value={f.sku} onChangeText={(v) => setF((x) => ({ ...x, sku: v }))} autoCapitalize="characters" />
          <View style={{ gap: 6 }}>
            <Body style={{ fontWeight: '700' }}>Categoría</Body>
            <Row wrap style={{ gap: space.sm }}>
              {CATEGORIES.map((c) => (
                <Button key={c} small label={c} variant={f.category === c ? 'ink' : 'outline'} onPress={() => setF((x) => ({ ...x, category: c }))} />
              ))}
            </Row>
          </View>
          <Toggle label="Producto frágil" hint="Se agrega relleno de protección de 2 cm por lado" value={fragile} onChange={setFragile} />
          <ErrorBox message={error} />
          <Button label="Guardar producto" onPress={save} loading={busy} disabled={!f.name || !f.length || !f.width || !f.height} />
          {!isNew && <Button label="Eliminar" variant="danger" onPress={remove} />}
        </>
      )}
    </Screen>
  );
}
