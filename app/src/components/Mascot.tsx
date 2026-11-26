/**
 * «Dimi», la mascota de DIMENSIONA: una caja kawaii con brazos y piernas.
 * En las pantallas de carga camina en su sitio: rebota, balancea brazos y piernas,
 * saluda con una mano y parpadea. Respeta «Reducir movimiento» (queda quieta).
 */
import { useEffect } from 'react';
import { Animated, Easing, View } from 'react-native';
import { colors } from '../theme';
import { NATIVE, reduceMotion, useAnimatedValue } from './motion';

const INK = colors.ink;
const PAPER = colors.paper;
const RED = colors.red;

export function Mascot({ size = 1 }: { size?: number }) {
  const step = useAnimatedValue(0); // 0 → 1 → 0: un paso
  const blink = useAnimatedValue(1);
  const wave = useAnimatedValue(0);

  useEffect(() => {
    if (reduceMotion()) return;
    const walk = Animated.loop(Animated.timing(step, { toValue: 1, duration: 760, easing: Easing.linear, useNativeDriver: NATIVE }));
    const blinking = Animated.loop(Animated.sequence([
      Animated.delay(2200),
      Animated.timing(blink, { toValue: 0.1, duration: 80, useNativeDriver: NATIVE }),
      Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: NATIVE }),
    ]));
    const waving = Animated.loop(Animated.sequence([
      Animated.timing(wave, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(wave, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
    ]));
    walk.start(); blinking.start(); waving.start();
    return () => { walk.stop(); blinking.stop(); waving.stop(); };
  }, [step, blink, wave]);

  // Dos rebotes por ciclo (uno por pie) y balanceo alterno de piernas y brazo izquierdo.
  const bounce = step.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -7, 0, -7, 0] });
  const tilt = step.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '-3deg', '0deg', '3deg', '0deg'] });
  const legA = step.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['22deg', '-22deg', '22deg'] });
  const legB = step.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-22deg', '22deg', '-22deg'] });
  const armL = step.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['40deg', '12deg', '40deg'] });
  const armR = wave.interpolate({ inputRange: [0, 1], outputRange: ['-150deg', '-115deg'] }); // saluda arriba
  const shadow = step.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.8, 1, 0.8, 1] });

  const leg = (rot: Animated.AnimatedInterpolation<string>, left: number) => (
    <Animated.View style={{ position: 'absolute', top: 92, left, width: 8, height: 22, transformOrigin: 'top', transform: [{ rotate: rot }] }}>
      <View style={{ flex: 1, width: 8, backgroundColor: INK, borderRadius: 4 }} />
      <View style={{ position: 'absolute', bottom: -3, left: -3, width: 15, height: 8, backgroundColor: RED, borderRadius: 4, borderWidth: 2, borderColor: INK }} />
    </Animated.View>
  );
  const arm = (rot: Animated.AnimatedInterpolation<string>, left: number) => (
    <Animated.View style={{ position: 'absolute', top: 58, left, width: 7, height: 26, transformOrigin: 'top', transform: [{ rotate: rot }] }}>
      <View style={{ flex: 1, width: 7, backgroundColor: INK, borderRadius: 4 }} />
      <View style={{ position: 'absolute', bottom: -5, left: -3, width: 13, height: 13, borderRadius: 7, backgroundColor: PAPER, borderWidth: 3, borderColor: INK }} />
    </Animated.View>
  );

  return (
    <View style={{ width: 120 * size, height: 136 * size, alignItems: 'center', justifyContent: 'flex-start' }} accessible={false}>
      <View style={{ width: 120, height: 136, transform: [{ scale: size }], transformOrigin: 'top' }}>
        {/* sombra */}
        <Animated.View style={{ position: 'absolute', bottom: 0, left: 30, width: 60, height: 10, borderRadius: 5, backgroundColor: 'rgba(20,20,20,0.18)', transform: [{ scaleX: shadow }] }} />
        {leg(legA, 44)}
        {leg(legB, 68)}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 120, height: 120, transform: [{ translateY: bounce }, { rotate: tilt }] }}>
          {/* solapas de la caja */}
          <View style={{ position: 'absolute', top: 18, left: 20, width: 40, height: 14, backgroundColor: PAPER, borderWidth: 3, borderColor: INK, transform: [{ skewX: '-18deg' }, { rotate: '-8deg' }] }} />
          <View style={{ position: 'absolute', top: 18, left: 60, width: 40, height: 14, backgroundColor: '#E4D8BE', borderWidth: 3, borderColor: INK, transform: [{ skewX: '18deg' }, { rotate: '8deg' }] }} />
          {/* cuerpo */}
          <View style={{ position: 'absolute', top: 28, left: 18, width: 84, height: 68, backgroundColor: PAPER, borderWidth: 4, borderColor: INK, borderRadius: 6, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: 0, left: 35, width: 14, height: 18, backgroundColor: RED }} />
            <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 14, backgroundColor: '#E4D8BE' }} />
          </View>
          {arm(armL, 16)}
          {arm(armR, 97)}
          {/* cara */}
          <Animated.View style={{ position: 'absolute', top: 56, left: 38, width: 9, height: 12, borderRadius: 5, backgroundColor: INK, transform: [{ scaleY: blink }] }}>
            <View style={{ position: 'absolute', top: 2, left: 2, width: 3, height: 3, borderRadius: 2, backgroundColor: '#fff' }} />
          </Animated.View>
          <Animated.View style={{ position: 'absolute', top: 56, left: 70, width: 9, height: 12, borderRadius: 5, backgroundColor: INK, transform: [{ scaleY: blink }] }}>
            <View style={{ position: 'absolute', top: 2, left: 2, width: 3, height: 3, borderRadius: 2, backgroundColor: '#fff' }} />
          </Animated.View>
          <View style={{ position: 'absolute', top: 70, left: 29, width: 12, height: 6, borderRadius: 3, backgroundColor: RED, opacity: 0.45 }} />
          <View style={{ position: 'absolute', top: 70, left: 77, width: 12, height: 6, borderRadius: 3, backgroundColor: RED, opacity: 0.45 }} />
          <View style={{ position: 'absolute', top: 68, left: 53, width: 12, height: 7, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, borderWidth: 3, borderTopWidth: 0, borderColor: INK }} />
        </Animated.View>
      </View>
    </View>
  );
}
