import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { api } from '../../api/client';
import type { Shipment, Stats } from '../../api/types';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Body, Button, Card, Empty, ErrorBox, Header, Loading, Row, Screen, SectionTitle, Stat, Title } from '../../components/ui';
import { money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../state/auth';
import { colors, fonts, space } from '../../theme';

export default function TiendaInicio() {
  const { store, user } = useAuth();
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [stats, ships] = await Promise.all([api.stats(), api.shipments({ status: 'creado,asignado,recogido,en_ruta,novedad' })]);
    return { stats: stats as Record<string, number>, ships: ships as Shipment[] };
  });
  const st = (data?.stats ?? {}) as Stats & Record<string, number>;

  return (
    <Screen header={<Header title={store?.name ?? 'Mi tienda'} kicker={`Hola, ${user?.name.split(' ')[0] ?? ''}`} />} onRefresh={reload} refreshing={refreshing}>
      {/* Acción principal: medir con la cámara */}
      <Card shadow={colors.red} onPress={() => router.push('/producto/nuevo?medir=1')}>
        <Row>
          <View style={{ width: 64, height: 64, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
            <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 22, transform: [{ rotate: '-45deg' }] }}>AR</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Title size={22}>Medir un producto</Title>
            <Body muted>Apunta la cámara: la realidad aumentada toma largo, ancho y alto.</Body>
          </View>
        </Row>
      </Card>
      <Button label="Nuevo envío" icon="▶" variant="ink" onPress={() => router.push('/nuevo-envio')} />

      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <Row wrap style={{ gap: space.sm }}>
            <Stat label="Ahorro por medir" value={money(st.ahorro)} accent sub="vs. elegir la caja a ojo" />
            <Stat label="Envíos activos" value={String(st.activos ?? 0)} sub={`${st.entregados ?? 0} entregados`} />
          </Row>
          <Row wrap style={{ gap: space.sm }}>
            <Stat label="Llenado de cajas" value={st.llenadoPromedio != null ? `${st.llenadoPromedio}%` : '—'} sub="promedio de tus paquetes" />
            <Stat label="Recaudo contra entrega" value={money(st.recaudo)} sub={`${st.productosMedidos ?? 0}/${st.productos ?? 0} productos medidos`} />
          </Row>

          <SectionTitle action={<Button small variant="ghost" label="Ver todos" onPress={() => router.push('/tienda/envios')} />}>En movimiento</SectionTitle>
          {data?.ships.length ? data.ships.slice(0, 5).map((s) => <ShipmentCard key={s.id} s={s} />) : (
            <Empty title="Sin envíos activos" body="Crea tu primer envío: elige productos, la app calcula la caja y el precio." action={<Button small label="Nuevo envío" onPress={() => router.push('/nuevo-envio')} />} />
          )}
        </>
      )}
    </Screen>
  );
}
