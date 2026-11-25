import { useState } from 'react';
import { api } from '../../api/client';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Empty, ErrorBox, Field, Header, Loading, Screen, Segmented } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';

const FILTERS = {
  pendientes: 'creado,novedad',
  ruta: 'asignado,recogido,en_ruta',
  cerrados: 'entregado,devuelto,cancelado',
} as const;
type F = keyof typeof FILTERS;

export default function Operacion() {
  const [f, setF] = useState<F>('pendientes');
  const [q, setQ] = useState('');
  const { data, error, loading, refreshing, reload } = useLoad(() => api.shipments({ status: FILTERS[f], q }), [f, q]);
  return (
    <Screen header={<Header title="Envíos" kicker="Operación" />} onRefresh={reload} refreshing={refreshing}>
      <Segmented value={f} onChange={setF} options={[{ value: 'pendientes', label: 'Atender' }, { value: 'ruta', label: 'En curso' }, { value: 'cerrados', label: 'Cerrados' }]} />
      <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Guía, cliente o ciudad" />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length ? data.map((s) => <ShipmentCard key={s.id} s={s} show="admin" />) : <Empty title="Sin envíos en esta vista" />}
    </Screen>
  );
}
