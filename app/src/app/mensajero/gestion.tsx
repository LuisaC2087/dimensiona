/**
 * Recoger y entregar: módulo del mensajero para registrar cada paso con evidencia.
 * Busca la guía (código del rótulo) o elige de la lista; cada acción abre el envío con su formulario.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '../../api/client';
import type { Shipment } from '../../api/types';
import { ShipmentCard } from '../../components/ShipmentCard';
import { Body, Button, Card, Empty, ErrorBox, Field, Header, Label, Loading, Row, Screen, SectionTitle } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';
import { useAuth } from '../../state/auth';
import { space } from '../../theme';

type Accion = 'recoger' | 'entregar' | 'novedad';
const open = (s: Shipment, accion: Accion) => router.push({ pathname: '/envio/[id]', params: { id: s.id, accion } });

export default function Gestion() {
  const { user } = useAuth();
  const { data, error, loading, refreshing, reload } = useLoad(() => api.shipments({ status: 'asignado,recogido,en_ruta,novedad' }));
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const mine = (data ?? []).filter((s) => s.courier_id === user?.id);
  const pickups = mine.filter((s) => s.status === 'asignado');
  const deliveries = mine.filter((s) => s.status !== 'asignado');

  const find = () => {
    setErr(null);
    const c = code.trim().toUpperCase();
    const s = mine.find((x) => x.code.toUpperCase() === c);
    if (!s) return setErr('No tienes asignada esa guía. Revisa el código del rótulo o tómala en «Disponibles».');
    open(s, s.status === 'asignado' ? 'recoger' : 'entregar');
  };

  return (
    <Screen header={<Header title="Recoger y entregar" kicker="Registra cada paso" />} onRefresh={reload} refreshing={refreshing}>
      <Card>
        <Label>Buscar por guía</Label>
        <Row style={{ alignItems: 'flex-end' }}>
          <Field required label="Código del rótulo" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="DM1234ABC" style={{ flex: 1 }} onSubmitEditing={find} />
          <Button label="Abrir" icon="magnify" onPress={find} disabled={!code.trim()} />
        </Row>
        <ErrorBox message={err} />
      </Card>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <SectionTitle>Por recoger ({pickups.length})</SectionTitle>
          <Body muted>En la tienda: verifica medidas, toma una foto del paquete y confirma la recogida.</Body>
          {pickups.length ? pickups.map((s) => (
            <ShipmentCard key={s.id} s={s} show="courier" extra={<Button small icon="package-variant-closed" label="Registrar recogida" onPress={() => open(s, 'recoger')} />} />
          )) : <Empty title="Sin recogidas pendientes" />}
          <SectionTitle>Por entregar ({deliveries.length})</SectionTitle>
          <Body muted>Con el cliente: escribe quién recibe, toma la foto de evidencia o reporta la novedad.</Body>
          {deliveries.length ? deliveries.map((s) => (
            <ShipmentCard key={s.id} s={s} show="recipient" extra={
              <Row style={{ gap: space.sm }}>
                <Button small icon="check-decagram" label="Registrar entrega" style={{ flex: 1 }} onPress={() => open(s, 'entregar')} />
                <Button small variant="outline" label="Novedad" onPress={() => open(s, 'novedad')} />
              </Row>
            } />
          )) : <Empty title="Nada por entregar" />}
        </>
      )}
    </Screen>
  );
}
