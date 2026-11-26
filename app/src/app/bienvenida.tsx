/** Guía de bienvenida por rol (se muestra una vez; se puede volver a ver desde Cuenta). */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Role } from '../api/types';
import { Icon, type IconName } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { Button } from '../components/ui';
import { markWelcomeSeen } from '../lib/onboarding';
import { homeFor, useAuth } from '../state/auth';
import { colors, fonts, space } from '../theme';

const SLIDES: Record<Role, { icon: IconName; title: string; body: string }[]> = {
  tienda: [
    { icon: 'cube-scan', title: 'Mide con la cámara', body: 'Apunta a tu producto: la realidad aumentada toma largo, ancho y alto. Guárdalo una vez y úsalo en todos tus envíos.' },
    { icon: 'package-variant-closed', title: 'La caja justa', body: 'Elegimos la caja más pequeña donde cabe todo. Menos aire = menos peso volumétrico = pagas menos.' },
    { icon: 'truck-fast', title: 'Envía como quieras', body: 'Mensajeros DIMENSIONA el mismo día en tu ciudad, o Servientrega y Coordinadora a todo el país. Compara precios y agenda la recogida.' },
    { icon: 'whatsapp', title: 'Tu cliente lo sigue', body: 'Comparte el rastreo por WhatsApp. Cobra contra entrega y te transferimos lo recaudado.' },
  ],
  mensajero: [
    { icon: 'hand-coin', title: 'Toma envíos', body: 'En «Disponibles» ves los envíos cerca de ti y cuánto ganas por cada uno.' },
    { icon: 'ruler-square-compass', title: 'Verifica al recoger', body: 'Mide el paquete con AR (realidad aumentada) antes de salir. Si no coincide con lo declarado, queda registrado.' },
    { icon: 'camera', title: 'Prueba de entrega', body: 'Escribe quién recibió y toma una foto. Si no hay nadie, reporta la novedad.' },
    { icon: 'cash-multiple', title: 'Tus pagos', body: 'En «Ganancias» ves lo que llevas, lo que tienes por cobrar y cada pago recibido.' },
  ],
  admin: [
    { icon: 'view-dashboard', title: 'Panel', body: 'Métricas de la operación y alertas: envíos sin mensajero, novedades y mensajeros por aprobar.' },
    { icon: 'bank', title: 'Finanzas', body: 'Factura cada mes, liquida los recaudos de las tiendas y paga a los mensajeros.' },
    { icon: 'message-alert', title: 'PQR', body: 'Responde peticiones, quejas y reclamos dentro de los 15 días hábiles.' },
    { icon: 'package-variant-closed', title: 'Tarifas', body: 'Ajusta cajas, servicios y precios por zona, incluidas las tarifas de tu contrato con cada transportadora.' },
  ],
};

export default function Bienvenida() {
  const { user } = useAuth();
  const [i, setI] = useState(0);
  if (!user) return null;
  const slides = SLIDES[user.role];
  const s = slides[i];
  const last = i === slides.length - 1;
  const finish = async () => { await markWelcomeSeen(); router.replace(homeFor(user.role)); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ flex: 1, overflow: 'hidden', justifyContent: 'center', padding: space.xl }}>
        <View style={{ position: 'absolute', width: '220%', height: 70, left: '-60%', bottom: 8, backgroundColor: colors.red, transform: [{ rotate: '-12deg' }] }} />
        <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 34, borderColor: colors.ink2, right: -110, top: -60 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'absolute', top: space.lg, left: space.xl, right: space.xl }}>
          <LogoMark size={40} negative />
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={10}><Text style={{ color: colors.paper3, fontFamily: fonts.displayMedium, fontSize: 15, letterSpacing: 1 }}>SALTAR</Text></Pressable>
        </View>
        <View style={{ width: 120, height: 120, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl, transform: [{ rotate: '-6deg' }] }}>
          <Icon name={s.icon} size={70} color={colors.paper} />
        </View>
        <Text style={{ color: colors.paper3, fontFamily: fonts.displayMedium, letterSpacing: 2, fontSize: 14 }}>{i + 1} / {slides.length}</Text>
        <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 42, lineHeight: 44, textTransform: 'uppercase', marginTop: 6 }}>{s.title}</Text>
        <Text style={{ color: colors.paper, fontSize: 17, lineHeight: 25, marginTop: space.md, maxWidth: 420 }}>{s.body}</Text>
      </View>
      <View style={{ padding: space.xl, gap: space.md, backgroundColor: colors.paper, borderTopWidth: 6, borderColor: colors.red }}>
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {slides.map((_, k) => <View key={k} style={{ width: k === i ? 28 : 10, height: 10, backgroundColor: k === i ? colors.red : colors.paper3 }} />)}
        </View>
        <Button label={last ? 'Empezar' : 'Siguiente'} icon={last ? 'rocket-launch' : 'arrow-right'} onPress={() => (last ? finish() : setI(i + 1))} />
        {i > 0 && <Button label="Atrás" variant="ghost" onPress={() => setI(i - 1)} />}
      </View>
    </SafeAreaView>
  );
}
