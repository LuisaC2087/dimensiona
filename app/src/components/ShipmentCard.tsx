import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { Shipment } from '../api/types';
import { dateTime, money, ZONE_LABEL } from '../lib/format';
import { colors, fonts, space } from '../theme';
import { Card, Row, STATUS_COLOR, StatusTag } from './ui';

export function ShipmentCard({ s, show = 'recipient', extra }: { s: Shipment; show?: 'recipient' | 'courier' | 'admin'; extra?: React.ReactNode }) {
  return (
    <Card accent={STATUS_COLOR[s.status]} onPress={() => router.push(`/envio/${s.id}`)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink, letterSpacing: 1 }}>{s.code}</Text>
        <StatusTag status={s.status} label={s.status_label} />
      </Row>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
        {show === 'admin' ? `${s.store_name} → ${s.recipient_name}` : s.recipient_name} · {s.city}
      </Text>
      <Text style={{ fontSize: 14, color: colors.grey }} numberOfLines={1}>
        {show === 'courier' && s.store_name ? `Recoger en ${s.store_name}${s.store_address ? ` · ${s.store_address}` : ''}` : s.address}
      </Text>
      <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
        <Text style={{ fontSize: 13, color: colors.grey }}>
          {ZONE_LABEL[s.zone]} · {s.packages.length} paq. · {dateTime(s.created_at)}
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>
          {show === 'courier' ? money(s.courier_fee) : money(s.price)}
        </Text>
      </Row>
      {s.cod_amount > 0 && (
        <View style={{ backgroundColor: colors.ink, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: colors.paper, fontSize: 12, fontWeight: '700' }}>CONTRA ENTREGA {money(s.cod_amount)}</Text>
        </View>
      )}
      {extra}
    </Card>
  );
}
