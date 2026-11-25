/** Detalle de un envío. Las acciones dependen del rol: tienda, mensajero o administración. */
import { useCallback, useState } from 'react';
import { Image, Linking, Platform, Share, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, trackingUrl } from '../../api/client';
import type { ShipmentStatus } from '../../api/types';
import { PackingView } from '../../components/PackingView';
import {
  Body, Button, Card, ErrorBox, Field, Header, KeyValue, Label, Loading, Row, Screen, SectionTitle, StatusTag, STATUS_COLOR, Tag,
} from '../../components/ui';
import { dateTime, dims, eta, kg, money, waNumber, ZONE_LABEL } from '../../lib/format';
import { toJpegBase64 } from '../../lib/image';
import { maxRelativeDiff } from '../../lib/measure';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../state/auth';
import { measureBus } from '../../state/measureBus';
import { colors, fonts, space } from '../../theme';

const NEXT: Partial<Record<ShipmentStatus, { status: ShipmentStatus; label: string }[]>> = {
  asignado: [{ status: 'recogido', label: 'Marcar recogido' }],
  recogido: [{ status: 'en_ruta', label: 'Salir a ruta' }],
  en_ruta: [{ status: 'entregado', label: 'Entregado' }, { status: 'novedad', label: 'Novedad' }],
  novedad: [{ status: 'en_ruta', label: 'Reintentar entrega' }, { status: 'devuelto', label: 'Devolver a tienda' }],
};

export default function EnvioDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: s, error, loading, reload, refreshing } = useLoad(() => api.shipment(id), [id]);
  const [action, setAction] = useState<ShipmentStatus | null>(null);
  const [note, setNote] = useState('');
  const [receiver, setReceiver] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<{ id: string; name: string; city: string }[] | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); setAction(null); setNote(''); setReceiver(''); setPhoto(null); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  // Verificación con AR: al volver de /medir se envían las medidas.
  useFocusEffect(useCallback(() => {
    const r = measureBus.take(`verify:${id}`);
    if (!r) return;
    void run(async () => {
      const v = await api.verify(id, { length: r.length, width: r.width, height: r.height });
      setVerifyMsg(v.matches ? `✓ Medidas verificadas: ${r.length}×${r.width}×${r.height} cm (${v.chargeableKg} kg cobrables)` : `⚠ Diferencia: ${v.chargeableKg} kg cobrables vs ${v.declaredChargeableKg} declarados. Quedó registrado.`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]));

  const takePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) { setErr('Sin permiso de cámara'); return; }
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (r.canceled || !r.assets?.[0]) return;
      setPhoto(`data:image/jpeg;base64,${await toJpegBase64(r.assets[0].uri, 720, 0.5)}`);
    } catch (e: any) { setErr(e.message); }
  };

  if (loading && !s) return <Screen header={<Header title="Envío" onBack={() => router.back()} />}><Loading /></Screen>;
  if (!s) return <Screen header={<Header title="Envío" onBack={() => router.back()} />}><ErrorBox message={error ?? 'No encontrado'} onRetry={reload} /></Screen>;

  const role = user?.role;
  const isMine = role === 'mensajero' && s.courier_id === user?.id;
  const url = trackingUrl(s.code);
  const waMsg = `Hola ${s.recipient_name.split(' ')[0]}, tu pedido de ${s.store_name} (guía ${s.code}) va en camino. Rastréalo aquí: ${url}`;
  const declaredDims = s.packages.map((p) => [p.box.length, p.box.width, p.box.height]);

  return (
    <Screen header={<Header title={s.code} kicker={s.store_name ?? 'Envío'} onBack={() => router.back()} />} onRefresh={reload} refreshing={refreshing}>
      <Card accent={STATUS_COLOR[s.status]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <StatusTag status={s.status} label={s.status_label} />
          <Text style={{ fontFamily: fonts.display, fontSize: 26 }}>{role === 'mensajero' ? money(s.courier_fee) : money(s.price)}</Text>
        </Row>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>{s.recipient_name}</Text>
        <Body>{s.address}, {s.city}</Body>
        {s.notes && <Body muted>«{s.notes}»</Body>}
        <Row wrap style={{ gap: 6 }}>
          <Tag label={ZONE_LABEL[s.zone]} />
          <Tag label={`${s.quote.serviceName} · ${eta(s.quote.etaDays)}`} color={colors.grey} />
          {s.cod_amount > 0 && <Tag label={`Recaudar ${money(s.cod_amount)}`} color={colors.red} />}
        </Row>
        {(role === 'mensajero' || role === 'admin') && (
          <Row wrap style={{ gap: space.sm, marginTop: space.sm }}>
            <Button small variant="ink" label="Llamar" onPress={() => Linking.openURL(`tel:${s.recipient_phone}`)} />
            <Button small variant="outline" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${waNumber(s.recipient_phone)}`)} />
            <Button small variant="outline" label="Mapa" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.address}, ${s.city}, Colombia`)}`)} />
          </Row>
        )}
      </Card>

      {role === 'mensajero' && s.store_address && (
        <Card>
          <Label>Recoger en</Label>
          <Text style={{ fontSize: 16, fontWeight: '700' }}>{s.store_name}</Text>
          <Body>{s.store_address}, {s.store_city}</Body>
          <Button small variant="outline" label="Mapa de recogida" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.store_address}, ${s.store_city}, Colombia`)}`)} />
        </Card>
      )}

      <ErrorBox message={err} />
      {verifyMsg && <Card accent={colors.ok}><Body style={{ fontWeight: '700' }}>{verifyMsg}</Body></Card>}

      {/* ─── Acciones del mensajero ─── */}
      {role === 'mensajero' && s.status === 'creado' && !s.courier_id && (
        <Button label={`Tomar envío · ganas ${money(s.courier_fee)}`} icon="◆" loading={busy} onPress={() => run(() => api.accept(s.id))} />
      )}
      {isMine && ['asignado', 'recogido'].includes(s.status) && (
        <Button label="Verificar medidas con AR" variant="outline" icon="◆"
          onPress={() => router.push({ pathname: '/medir', params: { purpose: `verify:${s.id}` } })} />
      )}
      {(isMine || role === 'admin') && NEXT[s.status] && !action && (
        <Row>
          {NEXT[s.status]!.map((n) => (
            <Button key={n.status} label={n.label} style={{ flex: 1 }} variant={n.status === 'novedad' || n.status === 'devuelto' ? 'outline' : 'primary'}
              onPress={() => (n.status === 'entregado' || n.status === 'novedad' ? setAction(n.status) : run(() => api.setStatus(s.id, { status: n.status })))} />
          ))}
        </Row>
      )}
      {action === 'entregado' && (
        <Card accent={colors.ok}>
          <Label>Prueba de entrega</Label>
          <Field label="¿Quién recibió?" value={receiver} onChangeText={setReceiver} placeholder="Nombre de quien recibe" />
          <Field label="Nota (opcional)" value={note} onChangeText={setNote} />
          {s.cod_amount > 0 && <Body style={{ fontWeight: '800', color: colors.redDark }}>Recuerda recaudar {money(s.cod_amount)}</Body>}
          {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 200 }} resizeMode="cover" /> : null}
          <Button small variant="outline" label={photo ? 'Repetir foto' : 'Foto de evidencia'} onPress={takePhoto} />
          <Row>
            <Button label="Confirmar entrega" style={{ flex: 1 }} loading={busy} disabled={!receiver}
              onPress={() => run(() => api.setStatus(s.id, { status: 'entregado', receiverName: receiver, note: note || undefined, photo: photo ?? undefined }))} />
            <Button small variant="ghost" label="Cancelar" onPress={() => setAction(null)} />
          </Row>
        </Card>
      )}
      {action === 'novedad' && (
        <Card accent={colors.warn}>
          <Field label="¿Qué pasó?" value={note} onChangeText={setNote} placeholder="No había nadie / dirección errada…" multiline />
          <Row wrap style={{ gap: space.sm }}>
            {['No había nadie', 'Dirección errada', 'Cliente rechazó', 'No contesta'].map((t) => <Button key={t} small variant="outline" label={t} onPress={() => setNote(t)} />)}
          </Row>
          <Row>
            <Button label="Reportar novedad" style={{ flex: 1 }} loading={busy} disabled={!note} onPress={() => run(() => api.setStatus(s.id, { status: 'novedad', note }))} />
            <Button small variant="ghost" label="Cancelar" onPress={() => setAction(null)} />
          </Row>
        </Card>
      )}

      {/* ─── Acciones de la tienda ─── */}
      {role === 'tienda' && (
        <Row wrap style={{ gap: space.sm }}>
          <Button label="Enviar rastreo" icon="✆" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${waNumber(s.recipient_phone)}?text=${encodeURIComponent(waMsg)}`)} />
          <Button label="Compartir" variant="outline" onPress={() => Share.share({ message: waMsg })} />
        </Row>
      )}
      {(role === 'tienda' || role === 'admin') && ['creado', 'asignado'].includes(s.status) && (
        <Button label="Cancelar envío" variant="danger" loading={busy} onPress={() => run(() => api.cancelShipment(s.id))} />
      )}

      {/* ─── Administración: asignar ─── */}
      {role === 'admin' && !['entregado', 'cancelado', 'devuelto'].includes(s.status) && (
        <Card>
          <Label>Mensajero: {s.courier_name ?? 'sin asignar'}</Label>
          {!couriers ? <Button small variant="outline" label="Asignar / reasignar" onPress={() => api.adminCouriers().then(setCouriers).catch((e) => setErr(e.message))} /> : (
            <Row wrap style={{ gap: space.sm }}>
              {couriers.map((c) => <Button key={c.id} small variant={c.id === s.courier_id ? 'ink' : 'outline'} label={`${c.name} · ${c.city}`} onPress={() => run(() => api.assign(s.id, c.id))} />)}
              {!couriers.length && <Body muted>No hay mensajeros activos.</Body>}
            </Row>
          )}
        </Card>
      )}

      <SectionTitle>Embalaje</SectionTitle>
      {s.packages.map((p, i) => (
        <Card key={i}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 20 }}>{p.box.name}</Text>
            <Tag label={`${p.fillPct}% lleno`} color={p.fillPct >= 50 ? colors.ok : colors.warn} />
          </Row>
          <Body muted>{dims(p.box.length, p.box.width, p.box.height)} · {kg(p.contentWeightKg)}</Body>
          <PackingView pkg={p} size={220} />
        </Card>
      ))}
      {s.verified && (
        <Card accent={s.verified.matches ? colors.ok : colors.warn}>
          <Label>Verificación al recoger</Label>
          <Body>{dims(s.verified.dims[0], s.verified.dims[1], s.verified.dims[2])} · {s.verified.chargeableKg} kg cobrables · por {s.verified.by}</Body>
          <Body muted>{s.verified.matches ? 'Coincide con lo declarado.' : `Difiere ${Math.round(maxRelativeDiff(s.verified.dims, declaredDims[0] ?? s.verified.dims) * 100)}% de la caja declarada.`}</Body>
        </Card>
      )}

      <SectionTitle>Productos</SectionTitle>
      <Card>
        {s.items.map((it, i) => <KeyValue key={i} k={`${it.qty} × ${it.name}`} v={dims(it.length, it.width, it.height)} />)}
        <KeyValue k="Peso cobrable" v={`${s.quote.chargeableKg} kg (real ${kg(s.quote.realKg)}, vol. ${kg(s.quote.volumetricKg)})`} />
        <KeyValue k="Flete" v={money(s.quote.freight)} />
        {s.quote.insurance > 0 && <KeyValue k="Seguro" v={money(s.quote.insurance)} />}
        {s.quote.codFee > 0 && <KeyValue k="Contra entrega" v={money(s.quote.codFee)} />}
        <KeyValue k="Total" v={money(s.price)} strong />
        {role !== 'tienda' && <KeyValue k="Pago al mensajero" v={money(s.courier_fee)} />}
      </Card>

      <SectionTitle>Historial</SectionTitle>
      <View style={{ borderLeftWidth: 6, borderColor: colors.ink, marginLeft: 8, gap: space.md }}>
        {[...(s.events ?? [])].reverse().map((e, i) => (
          <View key={e.id} style={{ paddingLeft: space.lg }}>
            <View style={{ position: 'absolute', left: -15, top: 3, width: 20, height: 20, transform: [{ rotate: '45deg' }], borderWidth: 4, borderColor: colors.ink, backgroundColor: i === 0 ? colors.red : colors.paper }} />
            <Text style={{ fontWeight: '800', fontSize: 15 }}>{e.status_label}</Text>
            {e.note && <Body>{e.note}</Body>}
            {e.receiver_name && <Body>Recibió: {e.receiver_name}</Body>}
            {e.photo && <Image source={{ uri: e.photo }} style={{ width: 160, height: 120, marginTop: 4, borderWidth: 2, borderColor: colors.ink }} />}
            <Body muted style={{ fontSize: 12 }}>{dateTime(e.created_at)}{e.by_name ? ` · ${e.by_name}` : ''}</Body>
          </View>
        ))}
      </View>
    </Screen>
  );
}
