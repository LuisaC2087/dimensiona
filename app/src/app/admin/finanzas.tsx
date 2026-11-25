/** Finanzas: facturación mensual a tiendas y liquidaciones (recaudos a tiendas, pagos a mensajeros). */
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../../api/client';
import { InvoiceCard } from '../../components/InvoiceCard';
import { Body, Button, Card, Empty, ErrorBox, Field, Header, Loading, Row, Screen, SectionTitle, Segmented, Stat, Tag, Tip } from '../../components/ui';
import { dateTime, money } from '../../lib/format';
import { openDocument } from '../../lib/print';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts, space } from '../../theme';

type Tab = 'facturas' | 'liquidaciones';

export default function Finanzas() {
  const [tab, setTab] = useState<Tab>('facturas');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState('');
  const inv = useLoad(() => api.adminInvoices(), []);
  const set = useLoad(() => api.adminSettlements(), []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); await Promise.all([inv.reload(), set.reload()]); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const invoices = inv.data ?? [];
  const pending = invoices.filter((i) => i.status === 'pendiente');
  const settlements = set.data ?? [];
  const toPay = settlements.filter((s) => s.status === 'pendiente');

  return (
    <Screen header={<Header title="Finanzas" kicker="Facturación y pagos" icon="bank" />} onRefresh={() => { void inv.reload(); void set.reload(); }} refreshing={inv.refreshing}>
      <Row wrap style={{ gap: space.sm }}>
        <Stat icon="cash-clock" label="Por cobrar" value={money(pending.reduce((s, i) => s + i.total, 0))} accent sub={`${pending.length} facturas pendientes`} />
        <Stat icon="bank-transfer-out" label="Por pagar" value={money(toPay.reduce((s, i) => s + i.amount, 0))} sub={`${toPay.length} liquidaciones`} />
      </Row>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'facturas', label: 'Facturas' }, { value: 'liquidaciones', label: 'Liquidaciones' }]} />
      <ErrorBox message={err ?? inv.error ?? set.error} />
      {msg && <Body style={{ color: colors.ok, fontWeight: '700' }}>{msg}</Body>}
      <Field label="Referencia del pago (opcional)" value={ref} onChangeText={setRef} placeholder="N.° de transferencia, Nequi, consignación…" hint="Se guarda en el próximo pago que registres" />

      {tab === 'facturas' ? (
        <>
          <Tip id="admin-facturas" title="Cierre de mes" icon="calendar-check">
            Genera las cuentas de cobro del periodo: se agrupan los envíos no facturados de cada tienda. Es un documento interno; la factura electrónica DIAN se emite con tu proveedor autorizado.
          </Tip>
          <Row style={{ alignItems: 'flex-end' }}>
            <Field label="Periodo (AAAA-MM)" value={period} onChangeText={setPeriod} style={{ flex: 1 }} autoCapitalize="none" />
            <Button label="Facturar" icon="file-document-multiple" loading={busy}
              onPress={() => run(async () => { const r = await api.adminRunBilling(period); setMsg(r.invoices.length ? `${r.invoices.length} facturas generadas` : 'No había envíos por facturar en ese periodo'); })} />
          </Row>
          <SectionTitle icon="receipt">Facturas</SectionTitle>
          {inv.loading && !inv.data ? <Loading /> : invoices.length ? invoices.map((i) => (
            <InvoiceCard key={i.id} inv={i} onOpen={() => openDocument('invoice', i.id).catch((e) => setErr(e.message))}
              extra={i.status === 'pendiente' ? (
                <>
                  <Button small icon="cash-check" label="Marcar pagada" onPress={() => run(async () => { await api.adminPayInvoice(i.id, ref); setRef(''); })} />
                  <Button small variant="danger" icon="cancel" label="Anular" onPress={() => run(() => api.adminVoidInvoice(i.id))} />
                </>
              ) : undefined} />
          )) : <Empty icon="receipt" title="Sin facturas" />}
        </>
      ) : (
        <>
          <Tip id="admin-liquidaciones" title="Liquidaciones" icon="swap-horizontal">
            Agrupa lo recaudado contra entrega (se le transfiere a cada tienda) y lo ganado por cada mensajero en envíos entregados.
          </Tip>
          <Button label="Generar liquidaciones" icon="calculator-variant" loading={busy}
            onPress={() => run(async () => { const r = await api.adminRunSettlements(); setMsg(r.length ? `${r.length} liquidaciones nuevas` : 'No hay nada pendiente por liquidar'); })} />
          {set.loading && !set.data ? <Loading /> : settlements.length ? settlements.map((s) => (
            <Card key={s.id} accent={s.status === 'pagada' ? colors.ok : colors.warn}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Tag label={s.kind === 'tienda' ? 'Recaudo → tienda' : 'Pago → mensajero'} color={s.kind === 'tienda' ? colors.ink : colors.red} />
                <Text style={{ fontFamily: fonts.display, fontSize: 22 }}>{money(s.amount)}</Text>
              </Row>
              <Body style={{ fontWeight: '700' }}>{s.store_name ?? s.courier_name}</Body>
              <Body muted style={{ fontSize: 13 }}>{s.shipments} envíos · {dateTime(s.created_at)}{s.payment_ref ? ` · Ref. ${s.payment_ref}` : ''}</Body>
              {s.status === 'pendiente'
                ? <Button small icon="bank-transfer" label="Registrar transferencia" onPress={() => run(async () => { await api.adminPaySettlement(s.id, ref); setRef(''); })} />
                : <Tag label="Pagada" color={colors.ok} />}
            </Card>
          )) : <Empty icon="swap-horizontal" title="Sin liquidaciones" />}
        </>
      )}
    </Screen>
  );
}
