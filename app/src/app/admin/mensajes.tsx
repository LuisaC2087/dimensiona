/** Administración: estado de los canales de aviso y registro de mensajes a destinatarios. */
import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Body, Card, Empty, ErrorBox, Header, KeyValue, Label, Loading, Row, Screen, SectionTitle, Stat, Tag } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts, space } from '../../theme';

const STATE = { enviado: 'Enviado', simulado: 'Manual', pendiente: 'Enviando', fallido: 'Falló' } as const;
const STATE_COLOR = { enviado: colors.ok, simulado: colors.warn, pendiente: colors.grey, fallido: colors.red } as const;

export default function Mensajes() {
  const { data, error, loading, reload, refreshing } = useLoad(api.adminMessages);
  const real = data?.channels.whatsapp === 'real';
  return (
    <Screen header={<Header title="Avisos" kicker="Administración" onBack={() => router.back()} />} onRefresh={reload} refreshing={refreshing}>
      {loading && !data && <Loading />}
      <ErrorBox message={error} onRetry={reload} />
      {data && (
        <>
          <SectionTitle icon="antenna">Canales</SectionTitle>
          <Card accent={real ? colors.ok : colors.warn}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ gap: space.sm }}><Icon name="whatsapp" /><Label>WhatsApp</Label></Row>
              <Tag label={real ? 'Conectado' : 'Manual'} color={real ? colors.ok : colors.warn} />
            </Row>
            <Body muted>
              {real
                ? `Se envía con la API oficial de WhatsApp (plantilla «${data.channels.template}»).`
                : 'Sin credenciales de Meta: los mensajes quedan listos y la tienda los envía con un toque. Para enviarlos solos, configura WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en Render y aprueba la plantilla.'}
            </Body>
            <KeyValue k="Correo (SMTP)" v={data.channels.email ? 'Configurado' : 'Sin configurar'} />
            <KeyValue k="Teléfonos con notificaciones" v={String(data.totals.dispositivos)} />
          </Card>
          {!real && (
            <Card>
              <Label>Plantilla para Meta</Label>
              <Text selectable style={{ fontFamily: fonts.displayMedium, fontSize: 14, color: colors.ink }}>
                {'Nombre: dimensiona_estado · Idioma: es · Categoría: Utilidad\n\nHola {{1}}, tu pedido de {{2}} {{3}}. Guía {{4}}. Síguelo aquí: {{5}}'}
              </Text>
              <Text accessibilityRole="link" style={{ fontSize: 13, color: colors.red, fontWeight: '700' }} onPress={() => Linking.openURL('https://developers.facebook.com/docs/whatsapp/cloud-api/get-started')}>Guía de WhatsApp Cloud API ↗</Text>
            </Card>
          )}

          <SectionTitle icon="chart-box">Últimos 30 días</SectionTitle>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Stat label="Enviados" value={String(data.totals.enviados)} icon="check" />
            <Stat label="Manuales" value={String(data.totals.simulados)} icon="hand-pointing-right" />
            <Stat label="Fallidos" value={String(data.totals.fallidos)} icon="alert" />
          </View>

          <SectionTitle icon="format-list-bulleted">Registro</SectionTitle>
          {data.items.length === 0 && <Empty icon="message-outline" title="Sin mensajes" body="Aparecerán cuando se creen envíos." />}
          {data.items.map((m) => (
            <Card key={m.id} onPress={() => router.push(`/envio/${m.shipment_id}`)} accent={STATE_COLOR[m.state]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: space.sm }}>
                  <Icon name={m.channel === 'whatsapp' ? 'whatsapp' : 'email-outline'} size={20} />
                  <Text style={{ fontFamily: fonts.display, fontSize: 16 }}>{m.code}</Text>
                </Row>
                <Tag label={STATE[m.state]} color={STATE_COLOR[m.state]} />
              </Row>
              <Body muted>{m.status_trigger.replace('_', ' ')} · {m.to_addr} · {dateTime(m.created_at)}</Body>
              {m.error && <Body style={{ color: colors.red }}>{m.error}</Body>}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
