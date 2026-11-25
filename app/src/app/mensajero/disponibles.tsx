import { useState } from 'react';
import { api } from '../../api/client';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Body, Button, Empty, ErrorBox, Header, Loading, Screen } from '../../components/ui';
import { money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';

export default function Disponibles() {
  const { data, error, loading, refreshing, reload } = useLoad(api.available);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const take = async (id: string) => {
    setBusy(id); setErr(null);
    try { await api.accept(id); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <Screen header={<Header title="Disponibles" kicker="Toma envíos cerca de ti" />} onRefresh={reload} refreshing={refreshing}>
      <Body muted>Primero los de tu ciudad. Al tomar un envío te comprometes a recogerlo hoy.</Body>
      <ErrorBox message={error ?? err} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length ? data.map((s) => (
        <ShipmentCard key={s.id} s={s} show="courier"
          extra={<Button small label={`Tomar · ${money(s.courier_fee)}`} loading={busy === s.id} onPress={() => take(s.id)} />} />
      )) : <Empty title="No hay envíos por tomar" body="Desliza hacia abajo para actualizar." />}
    </Screen>
  );
}
