import { router, type Href } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Shipment } from '../../api/types';
import { Icon, type IconName } from '../../components/Icon';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Bell } from '../../components/Bell';
import { Body, Button, Card, Empty, ErrorBox, Header, Loading, Row, Screen, SectionTitle, Stat, Title } from '../../components/ui';
import { FadeIn, Pulse } from '../../components/motion';
import { TourTarget } from '../../tour/TourTarget';
import { useTour } from '../../tour/TourProvider';
import { money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../state/auth';
import { colors, fonts, space } from '../../theme';

const ACTIONS: { icon: IconName; title: string; sub: string; href: Href; primary?: boolean }[] = [
  { icon: 'cube-scan', title: 'Medir', sub: 'con AR (realidad aumentada)', href: '/producto/nuevo?medir=1', primary: true },
  { icon: 'truck-fast', title: 'Enviar', sub: 'nuevo envío', href: '/nuevo-envio' },
  { icon: 'map-marker-radius', title: 'Rastrear', sub: 'una guía', href: '/rastreo' },
  { icon: 'receipt', title: 'Facturas', sub: 'y recaudos', href: '/tienda/facturas' },
];

function ActionTile({ a }: { a: (typeof ACTIONS)[number] }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${a.title} ${a.sub}`} onPress={() => router.push(a.href)}
      style={({ pressed }) => ({ width: '100%', flexGrow: 1, minHeight: 104, padding: space.md, gap: 6, justifyContent: 'space-between',
        backgroundColor: a.primary ? colors.red : colors.ink, borderWidth: 3, borderColor: colors.ink, transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [] })}>
      <Icon name={a.icon} size={34} color={colors.paper} />
      <View>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.paper, textTransform: 'uppercase' }}>{a.title}</Text>
        <Text style={{ color: colors.paper3, fontSize: 13 }}>{a.sub}</Text>
      </View>
    </Pressable>
  );
}

function FirstSteps({ products, shipments }: { products: number; shipments: number }) {
  const steps = [
    { done: products > 0, label: 'Mide tu primer producto', icon: 'cube-scan' as IconName, href: '/producto/nuevo?medir=1' as Href },
    { done: shipments > 0, label: 'Crea tu primer envío', icon: 'truck-fast' as IconName, href: '/nuevo-envio' as Href },
    { done: shipments > 0, label: 'Comparte el rastreo por WhatsApp', icon: 'whatsapp' as IconName, href: '/tienda/envios' as Href },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card accent={colors.red}>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, textTransform: 'uppercase' }}>Primeros pasos</Text>
      {steps.map((s) => (
        <Pressable key={s.label} accessibilityRole="button" onPress={() => router.push(s.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}>
          <Icon name={s.done ? 'check-circle' : 'circle-outline'} size={26} color={s.done ? colors.ok : colors.grey} />
          <Icon name={s.icon} size={20} color={colors.ink} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', textDecorationLine: s.done ? 'line-through' : 'none', color: s.done ? colors.grey : colors.ink }}>{s.label}</Text>
          {!s.done && <Icon name="chevron-right" size={22} color={colors.grey} />}
        </Pressable>
      ))}
    </Card>
  );
}

export default function TiendaInicio() {
  const tour = useTour();
  const { store, user } = useAuth();
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [stats, ships] = await Promise.all([api.stats(), api.shipments({ status: 'creado,asignado,recogido,en_ruta,novedad' })]);
    return { stats: stats as Record<string, number>, ships: ships as Shipment[] };
  });
  const st = (data?.stats ?? {}) as Record<string, number>;

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => { api.config().then((c) => setVideoUrl(c.videoUrl ?? null)).catch(() => {}); }, []);
  return (
    <Screen header={<Header title={store?.name ?? 'Mi tienda'} kicker={`Hola, ${user?.name.split(' ')[0] ?? ''}`} right={<Bell />} />} onRefresh={reload} refreshing={refreshing}>
      <Row wrap style={{ gap: space.sm }}>
        {ACTIONS.map((a, i) => <FadeIn key={a.title} delay={80 + i * 70} style={{ width: '48%', flexGrow: 1 }}>{i === 0 ? <TourTarget id="home.medir"><ActionTile a={a} /></TourTarget> : <ActionTile a={a} />}</FadeIn>)}
      </Row>

      {user?.email.endsWith('@demo.app') && (
        <Card accent={colors.red}>
          <Row>
            <Pulse><View style={{ width: 48, height: 48, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' }}><Icon name="play" size={30} color={colors.paper} /></View></Pulse>
            <View style={{ flex: 1 }}>
              <Title size={20}>Ver la app en acción</Title>
              <Body muted>Elige cómo conocerla: un recorrido guiado o un video.</Body>
            </View>
          </Row>
          <Button icon="gesture-tap" label="Demostración guiada" onPress={() => void tour.start('tienda')} />
          <Button icon="youtube" variant="outline" label={videoUrl ? 'Ver video de la app' : 'Video de la app · próximamente'} disabled={!videoUrl}
            onPress={() => { if (videoUrl) void Linking.openURL(videoUrl); }} />
        </Card>
      )}

      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <FirstSteps products={st.productos ?? 0} shipments={st.total ?? 0} />
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="piggy-bank" label="Ahorro por medir" value={money(st.ahorro)} accent sub="vs. elegir la caja a ojo" />
            <Stat icon="truck-delivery" label="Envíos activos" value={String(st.activos ?? 0)} sub={`${st.entregados ?? 0} entregados`} />
          </Row>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="package-variant" label="Llenado de cajas" value={st.llenadoPromedio != null ? `${st.llenadoPromedio}%` : '—'} sub="promedio de tus paquetes" />
            <Stat icon="hand-coin" label="Recaudo contra entrega" value={money(st.recaudo)} sub={`${st.productosMedidos ?? 0}/${st.productos ?? 0} productos medidos`} />
          </Row>

          <SectionTitle icon="truck-delivery" action={<Button small variant="ghost" label="Ver todos" onPress={() => router.push('/tienda/envios')} />}>En movimiento</SectionTitle>
          {data?.ships.length ? data.ships.slice(0, 5).map((s) => <ShipmentCard key={s.id} s={s} />) : (
            <Empty icon="truck-outline" title="Sin envíos activos" body="Crea un envío: elige productos y la app calcula la caja y el precio." action={<Button small icon="truck-fast" label="Nuevo envío" onPress={() => router.push('/nuevo-envio')} />} />
          )}
        </>
      )}
    </Screen>
  );
}
