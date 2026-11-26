import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { api } from '../../api/client';
import { Bell } from '../../components/Bell';
import { Button, Card, ErrorBox, Header, Label, Loading, Row, Screen, SectionTitle, Stat, STATUS_COLOR } from '../../components/ui';
import { money, ZONE_LABEL } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts, space } from '../../theme';

const STATUS_ES: Record<string, string> = { creado: 'Creado', asignado: 'Asignado', recogido: 'Recogido', en_ruta: 'En ruta', entregado: 'Entregado', novedad: 'Novedad', devuelto: 'Devuelto', cancelado: 'Cancelado' };

/** Barras horizontales simples (cantidad = largo de la barra, valor escrito al lado). */
function Bars({ rows, colorOf }: { rows: { label: string; n: number; key: string }[]; colorOf: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLabel={`${r.label}: ${r.n}`}>
          <Text style={{ width: 86, fontSize: 13, color: colors.ink }}>{r.label}</Text>
          <View style={{ flex: 1, height: 18 }}>
            <View style={{ width: `${(r.n / max) * 100}%`, height: '100%', backgroundColor: colorOf(r.key), minWidth: 4 }} />
          </View>
          <Text style={{ width: 32, textAlign: 'right', fontFamily: fonts.display, fontSize: 16 }}>{r.n}</Text>
        </View>
      ))}
    </View>
  );
}

export default function Panel() {
  const { data, error, loading, refreshing, reload } = useLoad(api.stats);
  const st = (data ?? {}) as Record<string, any>;
  return (
    <Screen header={<Header title="Panel" kicker="Administración" icon="view-dashboard" right={<Bell />} />} onRefresh={reload} refreshing={refreshing}>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="cash-register" label="Facturado" value={money(st.facturado)} accent />
            <Stat icon="chart-line" label="Margen plataforma" value={money(st.margen)} sub="facturado − pago mensajeros" />
          </Row>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="truck-delivery" label="Envíos activos" value={String(st.activos ?? 0)} sub={`${st.envios ?? 0} en total`} />
            <Stat icon="piggy-bank" label="Ahorro a clientes" value={money(st.ahorroClientes)} sub="por medir antes de enviar" />
          </Row>
          {(st.sinAsignar > 0 || st.novedades > 0 || st.pendientes > 0 || st.sinFacturarMesAnterior > 0 || st.facturasVencidas > 0 || st.liquidacionesPendientes > 0 || st.pqrPorVencer > 0) && (
            <Card accent={colors.red} shadow={colors.red}>
              <Label color={colors.redDark}>Requiere atención</Label>
              {st.sinAsignar > 0 && <Button small variant="outline" label={st.sinAsignar === 1 ? '1 envío sin mensajero' : `${st.sinAsignar} envíos sin mensajero`} onPress={() => router.push('/admin/operacion')} />}
              {st.novedades > 0 && <Button small variant="outline" label={st.novedades === 1 ? '1 novedad de entrega' : `${st.novedades} novedades de entrega`} onPress={() => router.push('/admin/operacion')} />}
              {st.sinFacturarMesAnterior > 0 && <Button small variant="outline" icon="file-document-multiple" label={`${st.sinFacturarMesAnterior} envíos del mes pasado sin facturar`} onPress={() => router.push('/admin/finanzas')} />}
              {st.facturasVencidas > 0 && <Button small variant="outline" icon="alert" label={`${st.facturasVencidas} facturas vencidas`} onPress={() => router.push('/admin/finanzas')} />}
              {st.liquidacionesPendientes > 0 && <Button small variant="outline" icon="bank-transfer" label={`${st.liquidacionesPendientes} liquidaciones por pagar`} onPress={() => router.push('/admin/finanzas')} />}
              {st.pqrPorVencer > 0 && <Button small variant="outline" icon="message-alert" label={`${st.pqrPorVencer} PQR por vencer`} onPress={() => router.push('/admin/soporte')} />}
              {st.pendientes > 0 && <Button small variant="outline" label={st.pendientes === 1 ? '1 mensajero por aprobar' : `${st.pendientes} mensajeros por aprobar`} onPress={() => router.push('/admin/usuarios')} />}
            </Card>
          )}
          <SectionTitle>Por estado</SectionTitle>
          <Card>
            <Bars rows={(st.byStatus ?? []).map((r: any) => ({ key: r.status, label: STATUS_ES[r.status] ?? r.status, n: r.n }))} colorOf={(k) => (STATUS_COLOR as any)[k] ?? colors.ink} />
          </Card>
          <SectionTitle>Por zona</SectionTitle>
          <Card>
            <Bars rows={(st.byZone ?? []).map((r: any) => ({ key: r.zone, label: ZONE_LABEL[r.zone] ?? r.zone, n: r.n }))} colorOf={(k) => (k === 'local' ? colors.red : k === 'regional' ? colors.ink : colors.grey)} />
          </Card>
          <Row wrap style={{ gap: space.sm }}>
            <Stat icon="storefront" label="Tiendas" value={String(st.tiendas ?? 0)} />
            <Stat icon="moped" label="Mensajeros activos" value={String(st.mensajeros ?? 0)} />
          </Row>
        </>
      )}
    </Screen>
  );
}
