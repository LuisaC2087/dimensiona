import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBaseUrl, getDefaultUrl, setBaseUrl } from '../api/client';
import { Body, Button, ErrorBox, Field, Label, Row, Title } from '../components/ui';
import { homeFor, useAuth } from '../state/auth';
import { colors, fonts, space } from '../theme';
import { LogoMark } from '../components/Logo';
import { FadeIn, Float, Pop } from '../components/motion';
import { useTour } from '../tour/TourProvider';

const DEMOS = [
  { label: 'Tienda', email: 'tienda@demo.app' },
  { label: 'Mensajero', email: 'mensajero@demo.app' },
];

export default function Login() {
  const { user, login } = useAuth();
  const tour = useTour();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(getBaseUrl());

  if (user) return <Redirect href={(safeNext ?? homeFor(user.role)) as any} />;

  const submit = async (e = email, p = password) => {
    setBusy(true); setError(null);
    try { await login(e.trim(), p); router.replace((safeNext ?? '/') as any); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.red }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Composición constructivista: círculo, diagonal y bloque de título */}
        <View style={s.hero}>
          <Pop style={s.circle}><View /></Pop>
          <FadeIn style={s.diag} distance={60}><View /></FadeIn>
          <Float style={{ marginBottom: space.sm, alignSelf: 'flex-start' }}><Pop><View style={{ backgroundColor: colors.ink, padding: 8 }}><LogoMark size={56} negative /></View></Pop></Float>
          <FadeIn delay={120}><Text style={s.kicker}>SMART LOGISTICS</Text></FadeIn>
          <FadeIn delay={220}><Text style={s.logo}>DIMEN{'\n'}SIONA</Text></FadeIn>
          <FadeIn delay={340}><Text style={s.tagline}>Mide. Empaca. Envía.</Text></FadeIn>
        </View>

        <View style={s.panel}>
          <Title size={26}>Entrar</Title>
          <Field label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="tu@correo.com" />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="••••••••" onSubmitEditing={() => submit()} />
          <ErrorBox message={error} />
          <Button label="Entrar" icon="login" onPress={() => submit()} loading={busy} disabled={!email || !password} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/olvido')} style={{ alignSelf: 'flex-end' }}><Text style={{ color: colors.redDark, fontWeight: '700', textDecorationLine: 'underline' }}>¿Olvidaste tu contraseña?</Text></Pressable>
          <Button label="Crear cuenta" icon="account-plus" variant="outline" onPress={() => router.push('/registro')} />

          <View style={{ gap: space.sm, marginTop: space.sm }}>
            <Label>Probar con una cuenta demo</Label>
            <Row>
              {DEMOS.map((d) => (
                <Button key={d.email} small variant="ink" label={d.label} style={{ flex: 1 }} onPress={() => { setEmail(d.email); setPassword('demo1234'); void submit(d.email, 'demo1234'); }} />
              ))}
            </Row>
            <Button icon="play-circle" label="Ver demostración guiada" loading={busy} onPress={async () => {
              setBusy(true); setError(null);
              try { await login('tienda@demo.app', 'demo1234'); await tour.start('tienda'); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
            }} />
          </View>

          <Row style={{ justifyContent: 'center' }}>
            <Button small variant="ghost" icon="map-marker-radius" label="Rastrear" onPress={() => router.push('/rastreo')} />
            <Button small variant="ghost" icon="message-alert-outline" label="PQR" onPress={() => router.push('/pqr')} />
          </Row>
          <Row style={{ justifyContent: 'center' }}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/legal/terminos')}><Text style={{ color: colors.grey, fontSize: 13, textDecorationLine: 'underline' }}>Términos</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push('/legal/privacidad')}><Text style={{ color: colors.grey, fontSize: 13, textDecorationLine: 'underline' }}>Tratamiento de datos</Text></Pressable>
          </Row>

          <Pressable onPress={() => setShowServer((v) => !v)} accessibilityRole="button">
            <Text style={{ color: colors.grey, fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' }}>Servidor: {getBaseUrl() || 'este sitio'}</Text>
          </Pressable>
          {showServer && (
            <View style={{ gap: space.sm }}>
              <Field label="URL del servidor" value={server} onChangeText={setServer} autoCapitalize="none" placeholder={getDefaultUrl() || 'https://…'} />
              <Row>
                <Button small label="Guardar" style={{ flex: 1 }} onPress={async () => { await setBaseUrl(server || null); setShowServer(false); }} />
                <Button small variant="outline" label="Restablecer" style={{ flex: 1 }} onPress={async () => { await setBaseUrl(null); setServer(getBaseUrl()); }} />
              </Row>
              <Body muted style={{ fontSize: 13 }}>Úsalo solo si tu empresa tiene su propio servidor DIMENSIONA.</Body>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: { minHeight: 260, padding: space.xl, justifyContent: 'flex-end', overflow: 'hidden' },
  circle: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 30, borderColor: colors.ink, right: -80, top: -70 },
  diag: { position: 'absolute', left: -60, right: -60, height: 46, backgroundColor: colors.paper, bottom: 40, transform: [{ rotate: '-9deg' }] },
  kicker: { fontFamily: fonts.displayMedium, color: colors.paper, letterSpacing: 4, fontSize: 14, marginBottom: 4 },
  logo: { fontFamily: fonts.display, color: colors.ink, fontSize: 68, lineHeight: 64, letterSpacing: 1 },
  tagline: { fontFamily: fonts.display, color: colors.paper, fontSize: 22, textTransform: 'uppercase', marginTop: 6, backgroundColor: colors.ink, alignSelf: 'flex-start', paddingHorizontal: 8 },
  panel: { flex: 1, backgroundColor: colors.paper, padding: space.xl, gap: space.md, borderTopWidth: 6, borderColor: colors.ink },
});
