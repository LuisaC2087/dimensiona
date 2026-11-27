import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../api/client';
import { Body, Button, Card, ErrorBox, Field, Header, Screen } from '../components/ui';
import { colors } from '../theme';

export default function Restablecer() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = pwd2.length > 0 && pwd !== pwd2;
  return (
    <Screen header={<Header title="Contraseña nueva" kicker="Recuperar acceso" />}>
      {!token && <ErrorBox message="El enlace está incompleto. Ábrelo de nuevo desde el correo." />}
      {done ? (
        <Card accent={colors.ok}>
          <Body>Listo, ya puedes entrar con tu contraseña nueva.</Body>
          <Button label="Entrar" icon="login" onPress={() => router.replace('/login')} />
        </Card>
      ) : (
        <>
          <Field required label="Contraseña nueva" value={pwd} onChangeText={setPwd} secureTextEntry hint="Mínimo 8 caracteres" />
          <Field required label="Repítela" value={pwd2} onChangeText={setPwd2} secureTextEntry error={mismatch ? 'No coinciden' : null} />
          <ErrorBox message={error} />
          <Button label="Guardar" icon="lock-reset" loading={busy} disabled={!token || pwd.length < 8 || pwd !== pwd2}
            onPress={async () => { setBusy(true); setError(null); try { await api.reset(token!, pwd); setDone(true); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
        </>
      )}
    </Screen>
  );
}
