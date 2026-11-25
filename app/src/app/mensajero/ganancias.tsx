import { api } from '../../api/client';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Body, Card, Empty, ErrorBox, Header, Loading, Row, Screen, SectionTitle, Stat } from '../../components/ui';
import { money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, space } from '../../theme';

export default function Ganancias() {
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [stats, done] = await Promise.all([api.stats(), api.shipments({ status: 'entregado,devuelto' })]);
    return { st: stats as Record<string, number>, done };
  });
  const st = data?.st ?? {};
  return (
    <Screen header={<Header title="Ganancias" kicker="Tu resumen" />} onRefresh={reload} refreshing={refreshing}>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <Row wrap style={{ gap: space.sm }}>
            <Stat label="Total ganado" value={money(st.ganancias)} accent />
            <Stat label="Entregas" value={String(st.entregados ?? 0)} sub={`${st.entregadosHoy ?? 0} hoy`} />
          </Row>
          <Card accent={colors.red}>
            <Body>Recaudo contra entrega acumulado: <Body style={{ fontWeight: '800' }}>{money(st.recaudo)}</Body></Body>
            <Body muted style={{ fontSize: 13 }}>Entrega este dinero a la tienda o a la oficina según el acuerdo de tu zona.</Body>
          </Card>
          <SectionTitle>Historial</SectionTitle>
          {data?.done.length ? data.done.map((s) => <ShipmentCard key={s.id} s={s} show="courier" />) : <Empty title="Aún sin entregas" />}
        </>
      )}
    </Screen>
  );
}
