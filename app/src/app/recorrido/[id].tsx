/**
 * Recorrido en vivo (cuentas demo): un envío real avanza solo y la pantalla muestra, paso a paso,
 * qué ve y hace cada rol — Tienda, Mensajero, Administración y Cliente final.
 * `/recorrido/nuevo` crea un envío demo y arranca la simulación.
 */
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, trackingUrl } from '../../api/client';
import type { Shipment } from '../../api/types';
import { Icon, type IconName } from '../../components/Icon';
import { FadeIn, Pop, Pulse } from '../../components/motion';
import { RequireAuth } from '../../components/RoleGate';
import { Body, Button, Card, ErrorBox, Header, Label, Loading, Screen, SectionTitle, Tag } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useAuth } from '../../state/auth';
import { useNotifications } from '../../state/notifications';
import { colors, fonts, space } from '../../theme';

type Role = 'tienda' | 'mensajero' | 'admin' | 'cliente';
const ROLES: { id: Role; name: string; icon: IconName }[] = [
  { id: 'tienda', name: 'Tienda', icon: 'storefront' },
  { id: 'mensajero', name: 'Mensajero', icon: 'motorbike' },
  { id: 'admin', name: 'Administración', icon: 'view-dashboard' },
  { id: 'cliente', name: 'Cliente final', icon: 'account-heart' },
];

interface Stage { label: string; icon: IconName; roles: Role[]; text: Record<Role, string> }
const stages = (code: string, who: string, courier: string): Stage[] => [
  { label: 'Creado', icon: 'package-variant-closed', roles: ['tienda', 'mensajero', 'admin', 'cliente'], text: {
    tienda: `Creaste el envío ${code}: la app midió, eligió la caja justa y cotizó.`,
    mensajero: 'Aviso «Envío disponible cerca»: aparece en la pestaña Disponibles.',
    admin: 'El panel suma un envío activo sin asignar.',
    cliente: `${who} recibe por WhatsApp su enlace de rastreo.` } },
  { label: 'Asignado', icon: 'account-arrow-right', roles: ['tienda', 'mensajero', 'admin'], text: {
    tienda: `Aviso: «Mensajero asignado». ${courier} va por el paquete.`,
    mensajero: 'Acepta el envío y ve la dirección de recogida en el mapa.',
    admin: 'El envío pasa a asignado; puede reasignarlo si hace falta.',
    cliente: 'El rastreo muestra «Mensajero asignado».' } },
  { label: 'Verificado', icon: 'ruler-square', roles: ['mensajero', 'tienda'], text: {
    tienda: 'Medidas confirmadas: no hay ajuste en el cobro.',
    mensajero: 'Mide el paquete con la cámara (AR) al recogerlo.',
    admin: 'Queda registro de la verificación de medidas.',
    cliente: 'Sin cambios: nada que hacer.' } },
  { label: 'Recogido', icon: 'package-variant', roles: ['tienda', 'mensajero', 'cliente'], text: {
    tienda: 'Aviso: «Paquete recogido».',
    mensajero: 'Marca «Recogido» y pega el rótulo con QR.',
    admin: 'El envío sigue en operación normal.',
    cliente: 'El rastreo muestra «Recogido».' } },
  { label: 'En ruta', icon: 'truck-fast', roles: ['tienda', 'mensajero', 'cliente'], text: {
    tienda: 'Aviso: «En ruta».',
    mensajero: 'Navega al destino con el mapa.',
    admin: 'Lo ve en Envíos › En ruta.',
    cliente: 'WhatsApp: «tu pedido va en camino».' } },
  { label: 'Novedad', icon: 'alert', roles: ['tienda', 'mensajero', 'admin', 'cliente'], text: {
    tienda: 'Aviso: «Novedad en la entrega» con el motivo.',
    mensajero: `Reporta «portería cerrada» y llama a ${who}.`,
    admin: '🔔 Alerta de novedad para hacer seguimiento.',
    cliente: 'WhatsApp: «tu pedido tuvo una novedad».' } },
  { label: 'Reintento', icon: 'refresh', roles: ['mensajero', 'cliente', 'tienda'], text: {
    tienda: 'Aviso: vuelve a «En ruta».',
    mensajero: 'Resuelve la novedad y reintenta la entrega.',
    admin: 'La novedad queda resuelta en el historial.',
    cliente: 'WhatsApp: «va en camino» otra vez.' } },
  { label: 'Entregado', icon: 'check-decagram', roles: ['tienda', 'mensajero', 'admin', 'cliente'], text: {
    tienda: 'Aviso: «Entregado ✓». El recaudo contra entrega entra a tu próxima liquidación.',
    mensajero: 'Registra quién recibió y la foto; el pago suma a sus ganancias.',
    admin: 'Cuenta para la facturación del mes y las liquidaciones.',
    cliente: 'WhatsApp: «fue entregado. ¡Gracias por tu compra!»' } },
];

function RolePanel({ role, text, active, stage }: { role: (typeof ROLES)[number]; text: string; active: boolean; stage: number }) {
  const card = (
    <View style={{ borderWidth: 3, borderColor: colors.ink, backgroundColor: active ? '#fff' : colors.paper, minHeight: 132 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: active ? colors.red : colors.ink, paddingHorizontal: 8, paddingVertical: 6 }}>
        <Icon name={role.icon} size={18} color={colors.paper} />
        <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 13, textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>{role.name}</Text>
        {active && <View style={{ width: 8, height: 8, backgroundColor: colors.paper, transform: [{ rotate: '45deg' }] }} />}
      </View>
      <FadeIn key={stage} distance={10} style={{ padding: 8 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, color: active ? colors.ink : colors.grey }}>{text}</Text>
      </FadeIn>
    </View>
  );
  return <View style={{ width: '48%', flexGrow: 1 }}>{active ? <Pop trigger={stage}>{card}</Pop> : card}</View>;
}

function Recorrido({ s }: { s: Shipment }) {
  const courier = s.courier_name?.split(' ')[0] ?? 'Andrés';
  const who = s.recipient_name.split(' ')[0];
  const list = stages(s.code, who, courier);
  const stage = Math.max(0, Math.min(list.length - 1, (s.events?.length ?? 1) - 1));
  const done = s.status === 'entregado';
  const cur = list[stage];
  const lastMsg = s.messages?.[s.messages.length - 1];
  return (
    <>
      <Card accent={done ? colors.ok : colors.red}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pulse active={!done}>
            <View style={{ width: 52, height: 52, backgroundColor: done ? colors.ok : colors.red, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={cur.icon} size={30} color={colors.paper} />
            </View>
          </Pulse>
          <View style={{ flex: 1 }}>
            <Label>{done ? 'Recorrido completo' : `Paso ${stage + 1} de ${list.length} · en vivo`}</Label>
            <Pop trigger={stage}><Text style={{ fontFamily: fonts.display, fontSize: 28, textTransform: 'uppercase', color: colors.ink }}>{cur.label}</Text></Pop>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Paso ${stage + 1} de ${list.length}`}>
          {list.map((x, i) => (
            <View key={x.label} style={{ flex: 1, height: 8, backgroundColor: i < stage ? colors.ink : i === stage ? colors.red : colors.paper3 }} />
          ))}
        </View>
      </Card>

      <SectionTitle icon="account-group">Qué ve cada rol</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {ROLES.map((r) => <RolePanel key={r.id} role={r} text={cur.text[r.id]} active={cur.roles.includes(r.id)} stage={stage} />)}
      </View>

      {lastMsg && (
        <>
          <SectionTitle icon="whatsapp">Último mensaje a {who}</SectionTitle>
          <FadeIn key={lastMsg.id}>
            <View style={{ backgroundColor: '#fff', borderWidth: 3, borderColor: colors.ink, borderLeftWidth: 10, borderLeftColor: colors.ok, padding: space.md, gap: 4 }}>
              <Body>{lastMsg.body}</Body>
              <Body muted style={{ fontSize: 12 }}>{dateTime(lastMsg.created_at)} · {lastMsg.state === 'enviado' ? 'enviado' : 'listo para enviar'}</Body>
            </View>
          </FadeIn>
        </>
      )}

      <SectionTitle icon="timeline-clock">Historial</SectionTitle>
      <View style={{ borderLeftWidth: 6, borderColor: colors.ink, marginLeft: 8, gap: space.md }}>
        {[...(s.events ?? [])].reverse().map((e, i) => (
          <FadeIn key={e.id} distance={8}>
            <View style={{ paddingLeft: space.lg }}>
              <View style={{ position: 'absolute', left: -15, top: 3, width: 20, height: 20, transform: [{ rotate: '45deg' }], borderWidth: 4, borderColor: colors.ink, backgroundColor: i === 0 ? colors.red : colors.paper }} />
              <Text style={{ fontWeight: '800', fontSize: 15 }}>{e.status_label}</Text>
              {e.note && <Body>{e.note}</Body>}
              <Body muted style={{ fontSize: 12 }}>{dateTime(e.created_at)}</Body>
            </View>
          </FadeIn>
        ))}
      </View>

      {done && (
        <FadeIn>
          <View style={{ gap: space.sm }}>
            <Button icon="replay" label="Repetir con otro envío" onPress={() => router.replace('/recorrido/nuevo')} />
            <Button icon="file-document-outline" variant="ink" label="Ver el envío" onPress={() => router.push(`/envio/${s.id}`)} />
            <Button icon="map-search" variant="outline" label="Ver el rastreo del cliente" onPress={() => {
              const u = trackingUrl(s.code);
              if (Platform.OS === 'web') globalThis.open?.(u, '_blank'); else void Linking.openURL(u);
            }} />
          </View>
        </FadeIn>
      )}
    </>
  );
}

const DEMO_RECIPIENT = { recipientName: 'Sofía Ramírez', recipientPhone: '3012223344', address: 'Av Boyacá #64-30' };

function Live() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, store } = useAuth();
  const notif = useNotifications();
  const [s, setS] = useState<Shipment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  const demo = user?.role === 'tienda' && user.email.endsWith('@demo.app');

  // «nuevo»: crea un envío demo, arranca la simulación y cambia a su recorrido.
  useEffect(() => {
    if (id !== 'nuevo' || !demo || started.current) return;
    started.current = true;
    (async () => {
      try {
        const products = await api.products();
        if (!products.length) throw new Error('Primero crea un producto en tu catálogo.');
        const created = await api.createShipment({ items: [{ productId: products[0].id, qty: 1 }], ...DEMO_RECIPIENT, city: store?.city ?? 'Bogotá' });
        await api.simulateDemo(created.id);
        router.replace(`/recorrido/${created.id}`);
      } catch (e: any) { setErr(e.message); }
    })();
  }, [id, demo, store?.city]);

  // Seguimiento en vivo cada 2,5 s hasta la entrega.
  const done = s?.status === 'entregado';
  useEffect(() => {
    if (id === 'nuevo' || done) return;
    let alive = true;
    const tick = () => api.shipment(id).then((x) => { if (alive) setS(x); }).catch((e) => alive && setErr(e.message));
    void tick();
    const t = setInterval(() => { void tick(); notif.refresh(); }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [id, done, notif]);

  return (
    <Screen header={<Header title="Recorrido en vivo" kicker={s?.code ?? 'Demostración'} icon="play-circle" onBack={() => (router.canGoBack() ? router.back() : router.replace('/tienda'))} />}>
      {!demo && <ErrorBox message="El recorrido en vivo está disponible con la cuenta demo de tienda." />}
      <ErrorBox message={err} />
      {demo && !s && !err && <Loading label={id === 'nuevo' ? 'Preparando un envío demo…' : 'Cargando…'} />}
      {s && <Recorrido s={s} />}
      {s && <Tag label="Datos de demostración" color={colors.grey} />}
    </Screen>
  );
}

export default function RecorridoScreen() {
  return <RequireAuth><Live /></RequireAuth>;
}
