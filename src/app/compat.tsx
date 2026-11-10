/** Detalle de compatibilidad y acciones de recuperación (RF-01). */
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AR_MESSAGES, openARCoreInStore, openAppSettings, requestCameraPermission } from '../device/compat';
import { useAppState } from '../state/AppState';
import { Button, Card, s } from '../components/ui';
import { colors } from '../theme';

const CAMERA_TEXT = 'DIMENSIONA usa la cámara solo para reconocer las superficies y medir. Las imágenes no salen de tu teléfono.';

export default function Compat() {
  const { compat, recheck } = useAppState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNote(null);
    try { await fn(); } finally { setBusy(false); }
  };

  if (!compat) return <View style={[s.screen, s.pad]}><Text style={s.body}>Verificando…</Text></View>;
  const msg = AR_MESSAGES[compat.ar];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card style={{ borderLeftColor: compat.ar === 'supported' ? colors.ok : compat.ar === 'unsupported' ? colors.danger : colors.warn }}>
        <Text style={s.h2}>Realidad aumentada: {msg.title}</Text>
        <Text style={s.body}>{msg.body}</Text>
      </Card>

      {compat.ar === 'needsInstall' && (
        <Button label="Instalar desde Google Play" loading={busy}
          onPress={() => run(async () => { if (!(await openARCoreInStore())) setNote('No se pudo abrir Google Play. Revisa tu conexión e intenta de nuevo.'); })} />
      )}

      <Card style={{ borderLeftColor: compat.camera === 'granted' ? colors.ok : colors.warn }}>
        <Text style={s.h2}>Permiso de cámara: {compat.camera === 'granted' ? 'concedido' : compat.camera === 'denied' ? 'no concedido' : 'sin verificar'}</Text>
        <Text style={s.body}>{CAMERA_TEXT}</Text>
      </Card>

      {compat.camera !== 'granted' && compat.ar !== 'unsupported' && (
        <>
          <Button label="Conceder permiso de cámara" loading={busy}
            onPress={() => run(async () => {
              const r = await requestCameraPermission();
              if (r !== 'granted') setNote('Si ya rechazaste el permiso, actívalo en Ajustes del teléfono › Permisos › Cámara.');
              await recheck();
            })} />
          <Button label="Abrir ajustes del teléfono" variant="secondary" onPress={() => openAppSettings()} />
        </>
      )}

      {note && <Text style={[s.body, { color: colors.warn }]}>{note}</Text>}

      <Button label="Volver a verificar" variant="secondary" loading={busy} onPress={() => run(recheck)} />
      {!compat.canScan && <Button label="Ver la demostración" variant="secondary" onPress={() => router.replace('/')} />}
      <Text style={s.muted}>Verificado en {compat.checkedInMs} ms.</Text>
    </ScrollView>
  );
}
