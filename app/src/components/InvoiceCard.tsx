import { Text } from 'react-native';
import type { Invoice } from '../api/types';
import { dateTime, money } from '../lib/format';
import { colors, fonts, space } from '../theme';
import { Icon } from './Icon';
import { Body, Button, Card, Row, Tag } from './ui';

const INV_COLOR = { pendiente: colors.red, pagada: colors.ok, anulada: colors.grey } as const;

export function InvoiceCard({ inv, onOpen, extra }: { inv: Invoice; onOpen?: () => void; extra?: React.ReactNode }) {
  const overdue = inv.status === 'pendiente' && new Date(inv.due_at) < new Date();
  return (
    <Card accent={overdue ? colors.redDark : INV_COLOR[inv.status]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: space.sm }}>
          <Icon name="receipt" size={22} color={colors.ink} />
          <Text style={{ fontFamily: fonts.display, fontSize: 20 }}>{inv.number}</Text>
        </Row>
        <Tag label={overdue ? 'Vencida' : inv.status} color={overdue ? colors.redDark : INV_COLOR[inv.status]} />
      </Row>
      {inv.store_name && <Body style={{ fontWeight: '700' }}>{inv.store_name}</Body>}
      <Row style={{ justifyContent: 'space-between' }}>
        <Body muted style={{ fontSize: 13 }}>Periodo {inv.period} · vence {dateTime(inv.due_at).split(' ·')[0]}</Body>
        <Text style={{ fontFamily: fonts.display, fontSize: 22 }}>{money(inv.total)}</Text>
      </Row>
      <Body muted style={{ fontSize: 12 }}>Subtotal {money(inv.subtotal)} + IVA {money(inv.iva)}</Body>
      <Row wrap style={{ gap: space.sm }}>
        {onOpen && <Button small variant="outline" icon="printer" label="Ver / imprimir" onPress={onOpen} />}
        {extra}
      </Row>
    </Card>
  );
}

