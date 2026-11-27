import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '../api/client';
import { Body, Button, Card, ErrorBox, Field, Header, Screen } from '../components/ui';
import { colors } from '../theme';

export default function Olvido() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Screen header={<Header title="Recuperar acceso" kicker="Contraseña" onBack={() => router.back()} />}>
      <Body>Escribe el correo de tu cuenta. Si está registrado te enviaremos un enlace para crear una contraseña nueva.</Body>
      <Field required label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <ErrorBox message={error} />
      {msg && <Card accent={colors.ok}><Body>{msg}</Body></Card>}
      <Button label="Enviar enlace" icon="email-fast" loading={busy} disabled={!email.includes('@')}
        onPress={async () => { setBusy(true); setError(null); try { setMsg((await api.forgot(email.trim())).message); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      <Button label="Volver a entrar" variant="ghost" onPress={() => router.replace('/login')} />
    </Screen>
  );
}
