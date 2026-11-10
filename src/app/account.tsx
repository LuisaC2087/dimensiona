/** Cuenta (RF-17): registro, inicio y cierre de sesión con correo; autorización Ley 1581 (ROT-04). */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useCloud } from '../state/CloudState';
import { Button, Card, s } from '../components/ui';
import { colors, minTouch, space } from '../theme';

const input = { minHeight: minTouch, color: colors.text, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: space.md, fontSize: 16 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Account() {
  const cloud = useCloud();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!cloud.configured) {
    return (
      <View style={[s.screen, s.pad]}>
        <Card style={{ borderLeftColor: colors.textMuted }}>
          <Text style={s.body}>Esta versión no tiene la nube configurada. Tus proyectos se guardan solo en este teléfono.</Text>
        </Card>
      </View>
    );
  }

  if (cloud.email) {
    const logout = async () => {
      setBusy(true);
      const warn = await cloud.signOut(false);
      setBusy(false);
      if (warn) {
        Alert.alert('Cambios sin subir', warn, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Cerrar sesión igual', style: 'destructive', onPress: () => cloud.signOut(true) },
        ]);
      }
    };
    const confirmDelete = () =>
      Alert.alert(
        'Eliminar cuenta',
        `Se eliminarán para siempre la cuenta ${cloud.email} y todos sus proyectos, en la nube y en este teléfono. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar', style: 'destructive',
            onPress: async () => {
              setBusy(true);
              const err = await cloud.deleteAccount();
              setBusy(false);
              Alert.alert(err ? 'No se pudo eliminar' : 'Cuenta eliminada', err ?? 'Tu cuenta y tus datos fueron eliminados.');
            },
          },
        ],
      );
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        <Card>
          <Text style={s.muted}>Sesión iniciada como</Text>
          <Text style={s.h2}>{cloud.email}</Text>
        </Card>
        <Card>
          <Text style={s.body}>Estado: {statusText(cloud.status)}</Text>
          <Text style={s.muted}>Cambios pendientes de subir: {cloud.pending}</Text>
          {cloud.lastSync && <Text style={s.muted}>Última sincronización: {cloud.lastSync.toLocaleString('es-CO')}</Text>}
          <Button label="Sincronizar ahora" variant="secondary" loading={cloud.status === 'syncing'} onPress={cloud.syncNow} />
        </Card>
        <Text style={s.muted}>
          Al cerrar sesión, tus proyectos se borran de este teléfono pero siguen en la nube; vuelven al iniciar sesión.
        </Text>
        <Button label="Cerrar sesión" variant="secondary" loading={busy} onPress={logout} />
        <Card style={{ borderLeftColor: colors.danger }}>
          <Text style={s.h2}>Eliminar cuenta</Text>
          <Text style={s.muted}>
            Borra de forma permanente tu cuenta, tu correo y todos tus proyectos, mediciones, notas y fotos de la nube y de este teléfono. No se puede deshacer.
          </Text>
          <Button label="Eliminar mi cuenta" variant="danger" loading={busy} onPress={confirmDelete} />
        </Card>
      </ScrollView>
    );
  }

  const submit = async () => {
    setMsg(null);
    if (!EMAIL_RE.test(email.trim())) return setMsg('Escribe un correo válido.');
    if (password.length < 6) return setMsg('La contraseña debe tener al menos 6 caracteres.');
    if (mode === 'signup' && !consent) return setMsg('Debes autorizar el tratamiento de tu correo para crear la cuenta.');
    setBusy(true);
    const r = mode === 'login' ? await cloud.signIn(email, password) : await cloud.signUp(email, password);
    setBusy(false);
    setMsg(r);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.body}>
        Con una cuenta tus proyectos se guardan en la nube y puedes recuperarlos en otro teléfono. Sin conexión, la app sigue funcionando y sincroniza cuando vuelva la red.
      </Text>
      <View style={s.row}>
        <Button label="Iniciar sesión" variant={mode === 'login' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setMode('login')} />
        <Button label="Crear cuenta" variant={mode === 'signup' ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setMode('signup')} />
      </View>
      <TextInput style={input} value={email} onChangeText={setEmail} placeholder="Correo" placeholderTextColor={colors.textMuted}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <TextInput style={input} value={password} onChangeText={setPassword} placeholder="Contraseña (mín. 6 caracteres)"
        placeholderTextColor={colors.textMuted} secureTextEntry autoComplete={mode === 'login' ? 'password' : 'new-password'} />
      {mode === 'signup' && (
        <Pressable onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}
          style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', minHeight: minTouch }}>
          <Text style={{ color: consent ? colors.accent : colors.textMuted, fontSize: 22 }}>{consent ? '☑' : '☐'}</Text>
          <Text style={[s.muted, { flex: 1 }]}>
            Autorizo a DIMENSIONA a tratar mi correo electrónico únicamente para identificar mi cuenta y guardar mis proyectos en la nube, conforme a la Ley 1581 de 2012. Puedo solicitar la eliminación de mi cuenta y datos en cualquier momento.
          </Text>
        </Pressable>
      )}
      {msg && <Text style={{ color: colors.warn, fontSize: 15 }}>{msg}</Text>}
      <Button label={mode === 'login' ? 'Entrar' : 'Crear cuenta'} loading={busy} onPress={submit} />
      <Text style={s.muted}>Si creas la cuenta, los proyectos que ya tienes en este teléfono se subirán a ella.</Text>
    </ScrollView>
  );
}

function statusText(st: string): string {
  return ({ syncing: 'sincronizando…', synced: 'al día', offline: 'sin conexión', error: 'error, se reintentará', signedOut: 'sin sesión', disabled: 'sin nube' } as Record<string, string>)[st] ?? st;
}
