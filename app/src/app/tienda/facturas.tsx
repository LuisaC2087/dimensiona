/** Facturación de la tienda: lo que debe, lo que se facturará y los recaudos que le pagan. */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../api/client';
import { InvoiceCard } from '../../components/InvoiceCard';
import { Icon } from '../../components/Icon';
import { Body, Card, Empty, ErrorBox, Header, Loading, Row, Screen, SectionTitle, Stat, Tag, Tip } from '../../components/ui';
import { dateTime, money } from '../../lib/format';
import { openDocument } from '../../lib/print';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts, space } from '../../theme';

export default function Facturas() {
  const { data, error, loading, refreshing, reload } = useLoad(api.billing);
  const [err, setErr] = useState<string | null>(null);
  const open = (id: string) => openDocument('invoice', id).catch((e) => setErr(e.message));

  return (
    <Screen header={<Header title="Facturas" kicker="Cobros y recaudos" icon="receipt" />} onRefresh={reload} refreshing={refreshing}>
      <Tip id="facturas" title="¿Cómo te cobramos?" icon="information-outline">
        Pagas por envío: cada guía genera su propia cuenta de cobro (IVA incluido), que se paga antes de la recogida. Sin mensualidades ni mínimos. El dinero que tus clientes pagan contra entrega te lo transferimos en liquidaciones.
      </Tip>
      <ErrorBox message={error ?? err} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="alert-circle-outline" label="Por pagar" value={money(data.owed)} accent={data.owed > 0} sub="facturas pendientes" />
            <Stat icon="cash-plus" label="Te debemos" value={money(data.codPending)} sub="recaudos por liquidar" />
          </Row>
          <Card accent={colors.ink}>
            <Row style={{ gap: space.sm }}><Icon name="calendar-month" size={22} /><Text style={{ fontFamily: fonts.display, fontSize: 18 }}>PRÓXIMA FACTURA</Text></Row>
            <Body>{data.unbilled.envios} envíos por {money(data.unbilled.total)} (IVA {data.ivaPct}% incluido: {money(data.unbilled.iva)}).</Body>
          </Card>

          <SectionTitle icon="receipt">Mis facturas</SectionTitle>
          {data.invoices.length ? data.invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} onOpen={() => open(inv.id)} />)
            : <Empty icon="receipt" title="Aún sin facturas" body="Tu primera cuenta de cobro aparecerá al crear tu primer envío." />}

          <SectionTitle icon="bank-transfer-in">Liquidaciones de recaudos</SectionTitle>
          {data.settlements.length ? data.settlements.map((s) => (
            <Card key={s.id} accent={s.status === 'pagada' ? colors.ok : colors.warn}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontWeight: '800' }}>{s.shipments} envíos contra entrega</Body>
                <Text style={{ fontFamily: fonts.display, fontSize: 20 }}>{money(s.amount)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body muted style={{ fontSize: 13 }}>{dateTime(s.created_at)}{s.payment_ref ? ` · Ref. ${s.payment_ref}` : ''}</Body>
                <Tag label={s.status === 'pagada' ? 'Transferida' : 'En proceso'} color={s.status === 'pagada' ? colors.ok : colors.warn} />
              </Row>
            </Card>
          )) : <View><Body muted>Cuando tus clientes paguen contra entrega, verás aquí las transferencias.</Body></View>}
        </>
      )}
    </Screen>
  );
}
