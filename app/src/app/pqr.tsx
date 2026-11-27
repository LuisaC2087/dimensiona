/** Radicar y consultar PQR (peticiones, quejas, reclamos, sugerencias). Con o sin cuenta. */
import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../api/client';
import type { Claim } from '../api/types';
import { Body, Button, Card, ErrorBox, Field, Header, Screen, SectionTitle, Segmented, Tag, Tip } from '../components/ui';
import { CLAIM_LABEL, dateTime } from '../lib/format';
import { useAuth } from '../state/auth';
import { colors, fonts } from '../theme';

type T = keyof typeof CLAIM_LABEL;

export default function Pqr() {
  const { code: initialCode } = useLocalSearchParams<{ code?: string }>();
  const { user } = useAuth();
  const [type, setType] = useState<T>('reclamo');
  const [f, setF] = useState({ name: user?.name ?? '', contact: user?.email ?? '', code: initialCode ?? '', message: '' });
  const [sent, setSent] = useState<{ number: string; due_at: string } | null>(null);
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState<Claim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setBusy(true); setError(null);
    try { setSent(await api.createClaim({ type, message: f.message, name: f.name, contact: f.contact, code: f.code || undefined })); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Screen header={<Header title="PQR" kicker="Peticiones, quejas y reclamos" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      {sent ? (
        <Card shadow={colors.red}>
          <Tag label="Radicada" color={colors.ok} />
          <Text selectable style={{ fontFamily: fonts.display, fontSize: 30 }}>{sent.number}</Text>
          <Body>Guarda este número. Te responderemos a más tardar el {dateTime(sent.due_at).split(' ·')[0]} (15 días hábiles).</Body>
          <Button label="Volver" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </Card>
      ) : (
        <>
          <Tip id="pqr" title="Tus derechos" icon="scale-balance">
            Puedes presentar peticiones, quejas, reclamos (p. ej. por pérdida o daño de un envío) o sugerencias. La ley nos da 15 días hábiles para responder; si no estás de acuerdo puedes acudir a la Superintendencia de Industria y Comercio.
          </Tip>
          <Segmented value={type} onChange={setType} options={(Object.keys(CLAIM_LABEL) as T[]).map((k) => ({ value: k, label: CLAIM_LABEL[k] }))} />
          {!user && <Field required label="Tu nombre" value={f.name} onChangeText={set('name')} />}
          {!user && <Field required label="Correo o celular" value={f.contact} onChangeText={set('contact')} autoCapitalize="none" />}
          <Field required={!user} label={user ? 'Guía relacionada (opcional)' : 'Código de tu guía'} value={f.code} onChangeText={set('code')} autoCapitalize="characters" placeholder="DM1234ABC" />
          <Field required label="Cuéntanos qué pasó" value={f.message} onChangeText={set('message')} multiline placeholder="Describe los hechos y lo que solicitas" />
          <ErrorBox message={error} />
          <Button label="Radicar" icon="send" loading={busy} onPress={submit} disabled={f.message.trim().length < 10 || (!user && (!f.code || !f.name || !f.contact))} />
        </>
      )}

      <SectionTitle icon="magnify">Consultar un radicado</SectionTitle>
      <Field required label="Número de radicado" value={lookup} onChangeText={setLookup} autoCapitalize="characters" placeholder="PQR-2026-00001" />
      <Button variant="outline" icon="magnify" label="Consultar" disabled={!lookup} onPress={async () => { setError(null); try { setFound(await api.claimStatus(lookup.trim())); } catch (e: any) { setError(e.message); setFound(null); } }} />
      {found && (
        <Card accent={found.status === 'cerrada' ? colors.ok : colors.warn}>
          <Tag label={found.status.replace('_', ' ')} color={found.status === 'cerrada' ? colors.ok : colors.warn} />
          <Body>{CLAIM_LABEL[found.type]} radicada el {dateTime(found.created_at)}</Body>
          {found.response ? <Body style={{ fontWeight: '700' }}>Respuesta: {found.response}</Body> : <Body muted>Aún en estudio. Fecha límite: {dateTime(found.due_at).split(' ·')[0]}</Body>}
        </Card>
      )}
    </Screen>
  );
}
