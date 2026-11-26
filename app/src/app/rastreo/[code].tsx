/** Rastreo público (cliente final): sin sesión. */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../api/client';
import type { TrackInfo } from '../../api/types';
import { Body, Button, Card, ErrorBox, Field, Header, Label, Loading, Screen, StatusTag, STATUS_COLOR } from '../../components/ui';
import { dateTime, eta } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts, space } from '../../theme';

const FLOW = ['creado', 'asignado', 'recogido', 'en_ruta', 'entregado'];
const FLOW_LABEL = ['Creado', 'Asignado', 'Recogido', 'En ruta', 'Entregado'];

export default function Rastreo() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [input, setInput] = useState(code && code !== 'buscar' ? code : '');
  const hasCode = !!code && code !== 'buscar';
  const { data, error, loading, reload } = useLoad<TrackInfo | null>(() => (hasCode ? api.track(code) : Promise.resolve(null)), [code]);
  const go = () => input.trim() && router.replace(`/rastreo/${input.trim().toUpperCase()}`);
  const idx = data ? FLOW.indexOf(data.status) : -1;

  return (
    <Screen header={<Header title="Rastrear envío" kicker="DIMENSIONA" onBack={router.canGoBack() ? () => router.back() : undefined} />}>
      <Field label="Código de guía" value={input} onChangeText={setInput} autoCapitalize="characters" placeholder="DM1234ABC" onSubmitEditing={go} />
      <Button label="Rastrear" onPress={go} disabled={!input.trim()} />
      {hasCode && loading && <Loading />}
      <ErrorBox message={hasCode ? error : null} onRetry={reload} />
      {data && (
        <>
          <Card accent={STATUS_COLOR[data.status]} shadow={colors.red}>
            <StatusTag status={data.status} label={data.status_label} />
            <Text style={{ fontFamily: fonts.display, fontSize: 32, letterSpacing: 2 }}>{data.code}</Text>
            <Body>De <Text style={{ fontWeight: '800' }}>{data.store}</Text> para {data.recipient} en {data.city}.</Body>
            {data.service && <Body muted>{data.service} · {eta(data.etaDays)}</Body>}
            {data.courier && <Body muted>Mensajero: {data.courier}</Body>}
          </Card>
          {idx >= 0 && (
            <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Progreso: ${data.status_label}`}>
              {FLOW.map((f, i) => (
                <View key={f} style={{ flex: 1, gap: 4 }}>
                  <View style={{ height: 12, backgroundColor: i <= idx ? colors.red : colors.paper3 }} />
                  <Text style={{ fontSize: 11, fontFamily: fonts.displayMedium, color: i <= idx ? colors.ink : colors.grey, textTransform: 'uppercase' }}>{FLOW_LABEL[i]}</Text>
                </View>
              ))}
            </View>
          )}
          {data.notifications && !['entregado', 'cancelado', 'devuelto'].includes(data.status) && (
            <Button small variant="ghost" icon="bell-off-outline" label="No recibir más avisos de este envío"
              onPress={() => api.optOut(data.code).then(reload).catch(() => {})} />
          )}
          <Label>Historial</Label>
          <View style={{ borderLeftWidth: 6, borderColor: colors.ink, marginLeft: 8, gap: space.md }}>
            {[...data.events].reverse().map((e, i) => (
              <View key={i} style={{ paddingLeft: space.lg }}>
                <View style={{ position: 'absolute', left: -15, top: 3, width: 20, height: 20, transform: [{ rotate: '45deg' }], borderWidth: 4, borderColor: colors.ink, backgroundColor: i === 0 ? colors.red : colors.paper }} />
                <Text style={{ fontWeight: '800' }}>{e.status_label}</Text>
                {e.note && <Body>{e.note}</Body>}
                {e.receiver && <Body>Recibió: {e.receiver}</Body>}
                <Body muted style={{ fontSize: 12 }}>{dateTime(e.at)}</Body>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
