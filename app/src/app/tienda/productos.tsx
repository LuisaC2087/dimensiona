import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../api/client';

import { Body, Button, Card, Empty, ErrorBox, Field, Header, Loading, Row, Screen, Tag } from '../../components/ui';
import { dims, kg, METHOD_LABEL, money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts } from '../../theme';



export default function Productos() {
  const { data, error, loading, refreshing, reload } = useLoad(api.products);
  const [q, setQ] = useState('');
  const list = (data ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <Screen header={<Header title="Productos" kicker={`${data?.length ?? 0} en catálogo`} />} onRefresh={reload} refreshing={refreshing}>
      <Row>
        <Button label="Medir nuevo" icon="cube-scan" style={{ flex: 1 }} onPress={() => router.push('/producto/nuevo?medir=1')} />
        <Button label="Manual" icon="pencil" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/producto/nuevo')} />
      </Row>
      {(data?.length ?? 0) > 4 && <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Nombre o SKU" />}
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : list.length ? list.map((p) => (
        <Card key={p.id} onPress={() => router.push(`/producto/${p.id}`)} accent={p.measured_by === 'ar' ? colors.red : colors.ink}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{p.name}</Text>
              {p.sku && <Body muted style={{ fontSize: 13 }}>{p.sku}{p.category ? ` · ${p.category}` : ''}</Body>}
            </View>
            <Text style={{ fontFamily: fonts.display, fontSize: 18 }}>{money(p.price)}</Text>
          </Row>
          <Text style={{ fontFamily: fonts.displayMedium, fontSize: 18, color: colors.ink }}>{dims(p.length_cm, p.width_cm, p.height_cm)} · {kg(p.weight_kg)}</Text>
          <Row wrap style={{ gap: 6 }}>
            <Tag label={METHOD_LABEL[p.measured_by]} color={p.measured_by === 'ar' ? colors.red : colors.grey} />
            {p.fragile && <Tag label="Frágil" color={colors.warn} />}
          </Row>
        </Card>
      )) : (
        <Empty title="Sin productos" body="Mide tu primer producto con la cámara para que la app elija la caja justa." />
      )}
    </Screen>
  );
}
