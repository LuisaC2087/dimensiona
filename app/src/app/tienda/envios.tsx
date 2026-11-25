import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Button, Empty, ErrorBox, Field, Header, Loading, Screen, Segmented } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';

const FILTERS = {
  activos: 'creado,asignado,recogido,en_ruta,novedad',
  entregados: 'entregado',
  otros: 'devuelto,cancelado',
} as const;
type F = keyof typeof FILTERS;

export default function Envios() {
  const [f, setF] = useState<F>('activos');
  const [q, setQ] = useState('');
  const { data, error, loading, refreshing, reload } = useLoad(() => api.shipments({ status: FILTERS[f], q }), [f, q]);
  return (
    <Screen header={<Header title="Envíos" kicker="Guías y rastreo" />} onRefresh={reload} refreshing={refreshing}>
      <Button label="Nuevo envío" icon="truck-fast" onPress={() => router.push('/nuevo-envio')} />
      <Segmented value={f} onChange={setF} options={[{ value: 'activos', label: 'Activos' }, { value: 'entregados', label: 'Entregados' }, { value: 'otros', label: 'Otros' }]} />
      <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Guía, cliente o ciudad" autoCapitalize="characters" />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length ? data.map((s) => <ShipmentCard key={s.id} s={s} />) : <Empty title="Nada por aquí" />}
    </Screen>
  );
}
