/** PQR: atención de peticiones, quejas, reclamos y sugerencias. */
import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../api/client';
import { Body, Button, Card, Empty, ErrorBox, Field, Header, Loading, Row, Screen, Segmented, Tag } from '../../components/ui';
import { CLAIM_LABEL, dateTime } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts } from '../../theme';

const STATUS_COLOR = { abierta: colors.red, en_tramite: colors.warn, cerrada: colors.ok } as const;

export default function Soporte() {
  const { data, error, loading, refreshing, reload } = useLoad(api.claims);
  const [f, setF] = useState<'abiertas' | 'cerradas'>('abiertas');
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const list = (data ?? []).filter((c) => (f === 'abiertas' ? c.status !== 'cerrada' : c.status === 'cerrada'));

  const respond = async (id: string, close: boolean) => {
    setErr(null);
    try { await api.adminRespondClaim(id, text, close); setOpen(null); setText(''); await reload(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <Screen header={<Header title="PQR" kicker="Atención al cliente" onBack={() => router.back()} />} onRefresh={reload} refreshing={refreshing}>
      <Segmented value={f} onChange={setF} options={[{ value: 'abiertas', label: 'Por responder' }, { value: 'cerradas', label: 'Cerradas' }]} />
      <ErrorBox message={error ?? err} onRetry={reload} />
      {loading && !data ? <Loading /> : list.length ? list.map((c) => {
        const late = c.status !== 'cerrada' && new Date(c.due_at) < new Date();
        return (
          <Card key={c.number} accent={late ? colors.redDark : STATUS_COLOR[c.status]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 18 }}>{c.number}</Text>
              <Tag label={late ? 'Vencida' : CLAIM_LABEL[c.type]} color={late ? colors.redDark : STATUS_COLOR[c.status]} />
            </Row>
            <Body style={{ fontWeight: '700' }}>{c.name} · {c.contact}{c.shipment_code ? ` · guía ${c.shipment_code}` : ''}</Body>
            <Body>{c.message}</Body>
            <Body muted style={{ fontSize: 12 }}>Radicada {dateTime(c.created_at)} · responder antes del {dateTime(c.due_at).split(' ·')[0]}</Body>
            {c.response && <Body style={{ backgroundColor: colors.paper2, padding: 8 }}>Respuesta: {c.response}</Body>}
            {c.status !== 'cerrada' && (open === c.id ? (
              <>
                <Field label="Respuesta" value={text} onChangeText={setText} multiline />
                <Row wrap>
                  <Button small icon="send" label="Responder y cerrar" disabled={text.length < 5} onPress={() => respond(c.id!, true)} />
                  <Button small variant="outline" label="En trámite" disabled={text.length < 5} onPress={() => respond(c.id!, false)} />
                </Row>
              </>
            ) : <Button small variant="outline" icon="reply" label="Responder" onPress={() => { setOpen(c.id!); setText(c.response ?? ''); }} />)}
          </Card>
        );
      }) : <Empty icon="emoticon-happy-outline" title="Nada pendiente" />}
    </Screen>
  );
}
