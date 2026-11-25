import { router } from 'expo-router';
import { api } from '../../api/client';
import type { Shipment } from '../../api/types';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Button, Empty, ErrorBox, Header, Loading, Row, Screen, SectionTitle, Stat } from '../../components/ui';
import { money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../state/auth';
import { space } from '../../theme';

const ORDER: Record<string, number> = { novedad: 0, en_ruta: 1, recogido: 2, asignado: 3 };

export default function MiRuta() {
  const { user } = useAuth();
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [ships, stats] = await Promise.all([api.shipments({ status: 'asignado,recogido,en_ruta,novedad' }), api.stats()]);
    return { ships: [...ships].sort((a: Shipment, b: Shipment) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)), stats: stats as Record<string, number> };
  });
  const st = data?.stats ?? {};
  const pickups = data?.ships.filter((s) => s.status === 'asignado') ?? [];
  const deliveries = data?.ships.filter((s) => s.status !== 'asignado') ?? [];

  return (
    <Screen header={<Header title="Mi ruta" kicker={`${user?.name.split(' ')[0] ?? ''} · ${user?.vehicle ?? ''}`} />} onRefresh={reload} refreshing={refreshing}>
      <ErrorBox message={error} onRetry={reload} />
      <Row wrap style={{ gap: space.sm }}>
        <Stat label="Entregas hoy" value={String(st.entregadosHoy ?? 0)} accent />
        <Stat label="Ganado" value={money(st.ganancias)} sub="envíos entregados" />
      </Row>
      {loading && !data ? <Loading /> : (
        <>
          <SectionTitle>Por entregar ({deliveries.length})</SectionTitle>
          {deliveries.length ? deliveries.map((s) => <ShipmentCard key={s.id} s={s} show="recipient" />) : <Empty title="Nada en ruta" />}
          <SectionTitle>Por recoger ({pickups.length})</SectionTitle>
          {pickups.length ? pickups.map((s) => <ShipmentCard key={s.id} s={s} show="courier" />) : (
            <Empty title="Sin recogidas" body={`Hay ${st.disponibles ?? 0} envíos disponibles para tomar.`} action={<Button small label="Ver disponibles" onPress={() => router.push('/mensajero/disponibles')} />} />
          )}
        </>
      )}
    </Screen>
  );
}
