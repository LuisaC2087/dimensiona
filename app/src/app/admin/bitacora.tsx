import { router } from 'expo-router';
import { api } from '../../api/client';
import { Body, Card, Empty, ErrorBox, Header, Loading, Screen } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';

const ACTION: Record<string, string> = {
  'billing.run': 'Facturación generada', 'invoice.pay': 'Factura pagada', 'invoice.void': 'Factura anulada', 'settlements.run': 'Liquidaciones generadas',
  'settlement.pay': 'Liquidación pagada', 'user.activate': 'Usuario activado', 'user.deactivate': 'Usuario desactivado', 'service.update': 'Tarifa modificada',
  'password.temp': 'Contraseña temporal', 'password.reset': 'Contraseña restablecida', 'claim.respond': 'PQR respondida',
};

export default function Bitacora() {
  const { data, error, loading, refreshing, reload } = useLoad(api.adminAudit);
  return (
    <Screen header={<Header title="Bitácora" kicker="Acciones sensibles" onBack={() => router.back()} />} onRefresh={reload} refreshing={refreshing}>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length ? data.map((a) => (
        <Card key={a.id}>
          <Body style={{ fontWeight: '800' }}>{ACTION[a.action] ?? a.action}</Body>
          <Body muted style={{ fontSize: 13 }}>{dateTime(a.created_at)} · {a.email ?? 'sistema'}{a.target ? ` · ${String(a.target).slice(0, 12)}` : ''}</Body>
        </Card>
      )) : <Empty icon="history" title="Sin registros" />}
    </Screen>
  );
}
