import { api } from '../../api/client';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Body, Card, Empty, ErrorBox, Header, Loading, Row, Screen, SectionTitle, Stat } from '../../components/ui';
import { money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, space } from '../../theme';

export default function Ganancias() {
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [stats, done, pay] = await Promise.all([api.stats(), api.shipments({ status: 'entregado,devuelto' }), api.payouts()]);
    return { st: stats as Record<string, number>, done, pay };
  });
  const st = data?.st ?? {};
  return (
    <Screen header={<Header title="Ganancias" kicker="Tu resumen" icon="cash-multiple" />} onRefresh={reload} refreshing={refreshing}>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="cash-multiple" label="Total ganado" value={money(st.ganancias)} accent />
            <Stat icon="package-variant-closed-check" label="Entregas" value={String(st.entregados ?? 0)} sub={`${st.entregadosHoy ?? 0} hoy`} />
          </Row>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="cash-clock" label="Por cobrar" value={money(data?.pay.pending.total)} sub={`${data?.pay.pending.envios ?? 0} entregas sin liquidar`} />
            <Stat icon="hand-coin" label="Recaudo en tu poder" value={money(data?.pay.codHeld)} sub="entrégalo en la oficina" />
          </Row>
          <SectionTitle icon="bank-transfer-in">Mis pagos</SectionTitle>
          {data?.pay.settlements.length ? data.pay.settlements.map((s) => (
            <Card key={s.id} accent={s.status === 'pagada' ? colors.ok : colors.warn}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontWeight: '800' }}>{s.shipments} entregas</Body>
                <Body style={{ fontWeight: '900', fontSize: 18 }}>{money(s.amount)}</Body>
              </Row>
              <Body muted style={{ fontSize: 13 }}>{s.status === 'pagada' ? `Pagado${s.payment_ref ? ` · Ref. ${s.payment_ref}` : ''}` : 'En proceso de pago'}</Body>
            </Card>
          )) : <Body muted>Tus pagos aparecerán aquí cuando administración liquide tus entregas.</Body>}
          <SectionTitle>Historial</SectionTitle>
          {data?.done.length ? data.done.map((s) => <ShipmentCard key={s.id} s={s} show="courier" />) : <Empty title="Aún sin entregas" />}
        </>
      )}
    </Screen>
  );
}
