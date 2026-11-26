/**
 * Nuevo envío en 4 pasos: productos → destinatario → caja y tarifa → confirmación.
 * La caja la elige el optimizador 3D con las medidas reales tomadas por la cámara.
 */
import { useEffect, useState } from 'react';
import { Linking, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, trackingUrl, type ItemInput } from '../api/client';
import type { Product, QuotePlan, Shipment } from '../api/types';
import { PackingView } from '../components/PackingView';
import { RoleGate } from '../components/RoleGate';
import {
  Body, Button, Card, Empty, ErrorBox, Field, Header, KeyValue, Label, Loading, Row, Screen, SectionTitle, Segmented, Steps, Tag, Title, Toggle,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { dims, eta, kg, money, waNumber, ZONE_LABEL } from '../lib/format';
import { useAuth } from '../state/auth';
import { colors, fonts, space } from '../theme';

type Step = 1 | 2 | 3 | 4;

export default function NuevoEnvioScreen() {
  return <RoleGate role="tienda"><NuevoEnvio /></RoleGate>;
}

function NuevoEnvio() {
  const { store } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [to, setTo] = useState({ recipientName: '', recipientPhone: '', recipientEmail: '', address: '', city: '', notes: '' });
  const [cod, setCod] = useState(false);
  const [codAmount, setCodAmount] = useState('');
  const [packing, setPacking] = useState<'catalogo' | 'medida'>('catalogo');
  const [plan, setPlan] = useState<QuotePlan | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [created, setCreated] = useState<Shipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.products().then(setProducts).catch((e) => setError(e.message)); }, []);

  const items: ItemInput[] = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, n]) => ({ productId, qty: n }));
  const goodsValue = (products ?? []).reduce((s, p) => s + (qty[p.id] ?? 0) * p.price, 0);

  const loadQuote = async (pk = packing) => {
    setBusy(true); setError(null);
    try {
      const r = await api.quote({ items, destCity: to.city, codAmount: cod ? Number(codAmount) || 0 : 0, packing: pk });
      setPlan(r);
      setServiceId(r.quotes[0]?.serviceId ?? null);
      setStep(3);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const s = await api.createShipment({ items, ...to, codAmount: cod ? Number(codAmount) || 0 : 0, serviceId, packing });
      setCreated(s); setStep(4);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const quote = plan?.quotes.find((q) => q.serviceId === serviceId) ?? null;
  const saving = quote?.baselineTotal ? quote.baselineTotal - quote.total : 0;
  const step2ok = to.recipientName && to.recipientPhone.replace(/\D/g, '').length >= 7 && to.address && to.city;

  const header = <Header title="Nuevo envío" kicker={step < 4 ? `Paso ${step} de 3` : 'Guía creada'} onBack={() => (step > 1 && step < 4 ? setStep((step - 1) as Step) : router.back())} />;

  if (step === 4 && created) {
    const url = trackingUrl(created.code);
    const msg = `¡Hola ${created.recipient_name.split(' ')[0]}! Tu pedido de ${store?.name ?? 'nuestra tienda'} va en camino 📦\nGuía: ${created.code}\nSíguelo aquí: ${url}`;
    return (
      <Screen header={header}>
        <Card shadow={colors.red} style={{ alignItems: 'center' }}>
          <Label>Guía</Label>
          <Text selectable style={{ fontFamily: fonts.display, fontSize: 44, letterSpacing: 3, color: colors.ink }}>{created.code}</Text>
          <Tag label={created.status_label} />
          <Body style={{ textAlign: 'center' }}>Un mensajero de la red la verá como disponible para recogerla en {store?.address ?? 'tu dirección'}.</Body>
        </Card>
        <KeyValue k="Total" v={money(created.price)} strong />
        <Button label="Enviar rastreo por WhatsApp" icon="whatsapp" onPress={() => Linking.openURL(`https://wa.me/${waNumber(created.recipient_phone)}?text=${encodeURIComponent(msg)}`)} />
        <Button label="Compartir" variant="outline" onPress={() => Share.share({ message: msg })} />
        <Button label="Ver guía" variant="ink" onPress={() => router.replace(`/envio/${created.id}`)} />
        <Button label="Otro envío" variant="ghost" onPress={() => { setQty({}); setTo({ recipientName: '', recipientPhone: '', recipientEmail: '', address: '', city: '', notes: '' }); setPlan(null); setCreated(null); setStep(1); }} />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <Steps current={step - 1} steps={[{ label: "Productos", icon: "cube-outline" }, { label: "Cliente", icon: "account" }, { label: "Caja y tarifa", icon: "truck-fast" }]} />
      <ErrorBox message={error} />

      {step === 1 && (
        <>
          <SectionTitle icon="cube-outline">¿Qué vas a enviar?</SectionTitle>
          {!products ? <Loading /> : products.length ? products.map((p) => {
            const n = qty[p.id] ?? 0;
            return (
              <Card key={p.id} accent={n ? colors.red : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800' }}>{p.name}</Text>
                    <Body muted style={{ fontSize: 13 }}>{dims(p.length_cm, p.width_cm, p.height_cm)} · {kg(p.weight_kg)}{p.fragile ? ' · frágil' : ''}</Body>
                  </View>
                  <Row style={{ gap: 0 }}>
                    <Button small variant="outline" label="−" onPress={() => setQty((q) => ({ ...q, [p.id]: Math.max(0, n - 1) }))} disabled={!n} />
                    <Text style={{ fontFamily: fonts.display, fontSize: 22, width: 36, textAlign: 'center' }}>{n}</Text>
                    <Button small variant={n ? 'primary' : 'ink'} label="+" onPress={() => setQty((q) => ({ ...q, [p.id]: Math.min(50, n + 1) }))} />
                  </Row>
                </Row>
              </Card>
            );
          }) : (
            <Empty title="Primero mide un producto" body="Necesitas productos con medidas para calcular la caja." action={<Button small label="Medir producto" onPress={() => router.push('/producto/nuevo?medir=1')} />} />
          )}
          <Button small variant="ghost" label="+ Medir un producto nuevo" onPress={() => router.push('/producto/nuevo?medir=1')} />
          <Button label={`Continuar (${items.reduce((s, i) => s + i.qty, 0)} unid.)`} disabled={!items.length} onPress={() => { setProducts((p) => p); setStep(2); api.products().then(setProducts).catch(() => undefined); }} />
        </>
      )}

      {step === 2 && (
        <>
          <SectionTitle icon="account">¿Para quién?</SectionTitle>
          <Field label="Nombre del cliente" value={to.recipientName} onChangeText={(v) => setTo((t) => ({ ...t, recipientName: v }))} autoComplete="name" />
          <Field label="Celular / WhatsApp" value={to.recipientPhone} onChangeText={(v) => setTo((t) => ({ ...t, recipientPhone: v }))} keyboardType="phone-pad" />
          <Field label="Correo (opcional)" value={to.recipientEmail} onChangeText={(v) => setTo((t) => ({ ...t, recipientEmail: v }))} keyboardType="email-address" autoCapitalize="none" autoComplete="email" hint="Le avisamos el estado de su pedido por WhatsApp y, si lo escribes, por correo" />
          <Field label="Dirección" value={to.address} onChangeText={(v) => setTo((t) => ({ ...t, address: v }))} placeholder="Cl 72 #10-34 Apto 501" />
          <Field label="Ciudad" value={to.city} onChangeText={(v) => setTo((t) => ({ ...t, city: v }))} placeholder="Medellín" hint={`Origen: ${store?.city ?? '—'}`} />
          <Field label="Indicaciones (opcional)" value={to.notes} onChangeText={(v) => setTo((t) => ({ ...t, notes: v }))} placeholder="Portería, horario, referencia…" multiline />
          <Toggle label="Pago contra entrega" hint="El mensajero recauda el valor al entregar" value={cod} onChange={(v) => { setCod(v); if (v && !codAmount && goodsValue) setCodAmount(String(goodsValue)); }} />
          {cod && <Field label="Valor a recaudar $" value={codAmount} onChangeText={setCodAmount} keyboardType="number-pad" />}
          <Button label="Calcular caja y tarifa" onPress={() => loadQuote()} loading={busy} disabled={!step2ok} />
        </>
      )}

      {step === 3 && plan && (
        <>
          <SectionTitle icon="package-variant-closed">Embalaje</SectionTitle>
          {plan.custom && (
            <Segmented value={packing} onChange={(v) => { setPacking(v); void loadQuote(v); }}
              options={[{ value: 'catalogo', label: 'Cajas estándar' }, { value: 'medida', label: 'Caja a medida' }]} />
          )}
          {busy ? <Loading label="Optimizando…" /> : plan.packages.map((p, i) => (
            <Card key={i}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Title size={22}>{plan.packages.length > 1 ? `Paquete ${i + 1}: ` : ''}{p.box.name}</Title>
                <Tag label={`${p.fillPct}% lleno`} color={p.fillPct >= 50 ? colors.ok : colors.warn} />
              </Row>
              <Body muted>{dims(p.box.length, p.box.width, p.box.height)} · {p.units} unid. · {kg(p.contentWeightKg)} de contenido</Body>
              <PackingView pkg={p} />
            </Card>
          ))}

          <SectionTitle icon="cash">Tarifa · {ZONE_LABEL[plan.zone]}</SectionTitle>
          {plan.quotes.length === 0 && <Empty title="Sin cobertura" body="Ningún servicio llega a ese destino." />}
          {plan.quotes.map((q) => {
            const on = q.serviceId === serviceId;
            return (
              <Card key={q.serviceId} onPress={() => setServiceId(q.serviceId)} accent={on ? colors.red : undefined} shadow={on ? colors.red : colors.ink}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ width: 44, height: 44, backgroundColor: on ? colors.red : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={q.carrier && q.carrier !== 'propia' ? 'truck-fast' : 'moped'} size={24} color={colors.paper} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800' }}>{q.serviceName}</Text>
                    <Body muted style={{ fontSize: 13 }}>{eta(q.etaDays)} · {q.chargeableKg} kg cobrables (vol. {String(q.volumetricKg).replace('.', ',')} kg)</Body>
                  </View>
                  <Text style={{ fontFamily: fonts.display, fontSize: 24 }}>{money(q.total)}</Text>
                </Row>
                <Row wrap style={{ gap: 6 }}>
                  {q.cheapest && <Tag label="Más económico" color={colors.ok} />}
                  {q.fastest && <Tag label="Más rápido" color={colors.red} />}
                  {q.carrier && q.carrier !== 'propia' ? <Tag label="Agendas la recogida" color={colors.grey} /> : <Tag label="Mensajero recoge" color={colors.ink} />}
                </Row>
              </Card>
            );
          })}

          {quote && (
            <Card style={{ backgroundColor: colors.ink }} shadow={colors.red}>
              <KeyValueDark k="Flete" v={money(quote.freight)} />
              {quote.insurance > 0 && <KeyValueDark k={`Seguro (valor ${money(plan.declaredValue)})`} v={money(quote.insurance)} />}
              {quote.codFee > 0 && <KeyValueDark k="Comisión contra entrega" v={money(quote.codFee)} />}
              <KeyValueDark k="Cartón de cajas (aparte, lo pones tú)" v={money(plan.boxCost)} />
              <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
                <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 20 }}>TOTAL ENVÍO</Text>
                <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 30 }}>{money(quote.total)}</Text>
              </Row>
              {saving > 0 && (
                <View style={{ backgroundColor: colors.red, padding: space.sm, marginTop: space.sm }}>
                  <Text style={{ color: colors.paper, fontWeight: '800' }}>Ahorras {money(saving)} frente a usar {plan.baseline?.boxes.join(', ')} «por si acaso».</Text>
                </View>
              )}
            </Card>
          )}
          <Button label="Crear guía" icon="check-decagram" onPress={create} loading={busy} disabled={!quote} />
        </>
      )}
    </Screen>
  );
}

function KeyValueDark({ k, v }: { k: string; v: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={{ color: colors.paper3, fontSize: 14, flexShrink: 1 }}>{k}</Text>
      <Text style={{ color: colors.paper, fontSize: 15, fontWeight: '700' }}>{v}</Text>
    </Row>
  );
}
