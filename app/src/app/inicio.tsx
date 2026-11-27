/** Portada de bienvenida de la APK (sin sesión): marca y botón para iniciar sesión. */
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { FadeIn, Pop, Spin } from '../components/motion';
import { homeFor, useAuth } from '../state/auth';
import { colors, fonts, space } from '../theme';

export default function Inicio() {
  const { user } = useAuth();
  if (user) return <Redirect href={homeFor(user.role)} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.red }}>
      <View style={s.hero}>
        <Pop style={s.circleWrap}><Spin style={s.circle}><View /></Spin></Pop>
        <FadeIn style={s.diag} distance={60}><View /></FadeIn>
        <FadeIn><LogoMark size={88} /></FadeIn>
        <FadeIn delay={120}><Text style={s.kicker}>BIENVENIDO A</Text></FadeIn>
        <FadeIn delay={220}><Text style={s.logo}>DIMEN{'\n'}SIONA</Text></FadeIn>
        <FadeIn delay={340}><Text style={s.tagline}>Mide. Empaca. Envía.</Text></FadeIn>
      </View>
      <View style={s.panel}>
        <Text style={s.lead}>Mide tus productos con la cámara, elige la caja justa y envía a todo el país.</Text>
        <Button label="Iniciar sesión" icon="login" onPress={() => router.push('/login')} />
        <Button label="Crear cuenta" icon="account-plus" variant="outline" onPress={() => router.push('/registro')} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: { flex: 1, padding: space.xl, justifyContent: 'flex-end', overflow: 'hidden', gap: 4 },
  circleWrap: { position: 'absolute', width: 300, height: 300, right: -90, top: -60 },
  circle: { width: 300, height: 300, borderRadius: 150, borderWidth: 34, borderColor: colors.ink, borderTopColor: colors.paper },
  diag: { position: 'absolute', left: -60, right: -60, height: 46, backgroundColor: colors.paper, bottom: 60, transform: [{ rotate: '-9deg' }] },
  kicker: { fontFamily: fonts.displayMedium, color: colors.paper, letterSpacing: 4, fontSize: 14, marginTop: space.md },
  logo: { fontFamily: fonts.display, color: colors.ink, fontSize: 72, lineHeight: 68, letterSpacing: 1 },
  tagline: { fontFamily: fonts.display, color: colors.paper, fontSize: 22, textTransform: 'uppercase', marginTop: 6, backgroundColor: colors.ink, alignSelf: 'flex-start', paddingHorizontal: 8 },
  lead: { fontSize: 17, lineHeight: 24, color: colors.ink },
  panel: { backgroundColor: colors.paper, padding: space.xl, gap: space.md, borderTopWidth: 6, borderColor: colors.ink },
});
