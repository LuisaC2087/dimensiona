/** Aceptación de una versión nueva de los Términos y la Política de datos. */
import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '../api/client';
import { useAuth } from '../state/auth';
import { colors } from '../theme';
import { Body, Button, Card, ErrorBox, Header, Row, Screen, Toggle } from './ui';

export function TermsUpdate({ version }: { version: string }) {
  const { refresh, logout } = useAuth();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen header={<Header title="Actualizamos los términos" kicker={`Versión ${version}`} icon="file-document-edit" />}>
      <Card accent={colors.red}>
        <Body>Agregamos facturación mensual, liquidación de recaudos, envíos con Servientrega y Coordinadora, y el canal de PQR. Léelos y acéptalos para seguir usando DIMENSIONA.</Body>
      </Card>
      <Row>
        <Button small variant="outline" icon="file-document" label="Términos" style={{ flex: 1 }} onPress={() => router.push('/legal/terminos')} />
        <Button small variant="outline" icon="shield-lock" label="Datos personales" style={{ flex: 1 }} onPress={() => router.push('/legal/privacidad')} />
      </Row>
      <Toggle label="Acepto los Términos y Condiciones y la Política de Tratamiento de Datos" value={ok} onChange={setOk} />
      <ErrorBox message={error} />
      <Button label="Aceptar y continuar" icon="check-decagram" disabled={!ok} loading={busy}
        onPress={async () => { setBusy(true); setError(null); try { await api.acceptTerms(version); await refresh(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } }} />
      <Button label="Cerrar sesión" variant="ghost" icon="logout" onPress={async () => { await logout(); router.replace('/login'); }} />
    </Screen>
  );
}
