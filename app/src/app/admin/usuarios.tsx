import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../api/client';
import { Body, Button, Card, ErrorBox, Header, Loading, Row, Screen, Segmented, Tag } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';
import { colors } from '../../theme';

type F = 'todos' | 'tienda' | 'mensajero';

export default function Usuarios() {
  const { data, error, loading, refreshing, reload } = useLoad(api.adminUsers);
  const [f, setF] = useState<F>('todos');
  const [err, setErr] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ email: string; tempPassword: string } | null>(null);
  const list = (data ?? []).filter((u) => f === 'todos' || u.role === f);

  const toggle = async (id: string, active: boolean) => {
    setErr(null);
    try { await api.adminSetActive(id, active); await reload(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <Screen header={<Header title="Usuarios" kicker={`${data?.length ?? 0} cuentas`} />} onRefresh={reload} refreshing={refreshing}>
      <Segmented value={f} onChange={setF} options={[{ value: 'todos', label: 'Todos' }, { value: 'tienda', label: 'Tiendas' }, { value: 'mensajero', label: 'Mensajeros' }]} />
      <ErrorBox message={error ?? err} onRetry={reload} />
      {temp && (
        <Card accent={colors.red} shadow={colors.red}>
          <Body style={{ fontWeight: '800' }}>Contraseña temporal de {temp.email}</Body>
          <Text selectable style={{ fontSize: 24, fontWeight: '900', letterSpacing: 2 }}>{temp.tempPassword}</Text>
          <Body muted>Compártela por un canal privado y pide que la cambie en Cuenta. No se volverá a mostrar.</Body>
          <Button small variant="outline" label="Entendido" onPress={() => setTemp(null)} />
        </Card>
      )}
      {loading && !data ? <Loading /> : list.map((u) => (
        <Card key={u.id} accent={!u.active ? colors.warn : u.role === 'admin' ? colors.red : colors.ink}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800' }}>{u.store_name ?? u.name}</Text>
              <Body muted style={{ fontSize: 13 }}>{u.store_name ? `${u.name} · ` : ''}{u.email}</Body>
              <Body muted style={{ fontSize: 13 }}>{u.city ?? '—'}{u.vehicle ? ` · ${u.vehicle}` : ''} · {u.envios} envíos</Body>
            </View>
            <Tag label={u.role} color={u.role === 'admin' ? colors.red : colors.ink} />
          </Row>
          {u.role !== 'admin' && (
            <Row wrap style={{ gap: 8 }}>
              {u.active
                ? <Button small variant="danger" icon="account-cancel" label="Desactivar" onPress={() => toggle(u.id, false)} />
                : <Button small icon="account-check" label={u.role === 'mensajero' ? 'Aprobar mensajero' : 'Reactivar'} onPress={() => toggle(u.id, true)} />}
              <Button small variant="outline" icon="key-variant" label="Clave temporal" onPress={async () => { setErr(null); try { setTemp(await api.adminTempPassword(u.id)); } catch (e: any) { setErr(e.message); } }} />
            </Row>
          )}
        </Card>
      ))}
    </Screen>
  );
}
