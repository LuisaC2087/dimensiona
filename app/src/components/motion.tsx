/**
 * Movimiento constructivista: entradas en diagonal, golpes de escala y bandas que barren.
 * Todo usa Animated (nativo y web) y respeta «Reducir movimiento» del sistema.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

export const NATIVE = Platform.OS !== 'web';

let reduced = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduced = v; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduced = v; });
export const reduceMotion = () => reduced;

/** Valor animado estable por componente (sin leer refs durante el render). */
export function useAnimatedValue(initial: number) {
  const [v] = useState(() => new Animated.Value(reduced ? 1 : initial));
  return v;
}

/** Entra subiendo y apareciendo; `delay` en ms para escalonar. */
export function FadeIn({ children, delay = 0, distance = 18, style }: { children: ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const t = useAnimatedValue(0);
  useEffect(() => {
    if (reduced) { t.setValue(1); return; }
    const a = Animated.timing(t, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [t, delay]);
  return (
    <Animated.View style={[style, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Aparece con un golpe de escala (resorte). Cambia `trigger` para repetirlo. */
export function Pop({ children, trigger, style }: { children: ReactNode; trigger?: unknown; style?: StyleProp<ViewStyle> }) {
  const s = useAnimatedValue(0.6);
  useEffect(() => {
    if (reduced) { s.setValue(1); return; }
    s.setValue(0.6);
    const a = Animated.spring(s, { toValue: 1, friction: 5, tension: 140, useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [s, trigger]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

/** Latido continuo (para lo que está «en vivo»). */
export function Pulse({ children, active = true, style }: { children: ReactNode; active?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = useAnimatedValue(0);
  useEffect(() => {
    if (!active || reduced) { p.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(p, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p, active]);
  return <Animated.View style={[style, { transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}>{children}</Animated.View>;
}

/** Flota suavemente arriba y abajo (ilustraciones, estados vacíos). */
export function Float({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const f = useAnimatedValue(0);
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(f, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(f, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [f]);
  return <Animated.View style={[style, { transform: [{ translateY: f.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }]}>{children}</Animated.View>;
}

/** Sacudida corta cuando cambia `trigger` (p. ej. llegó un aviso). */
export function Shake({ children, trigger }: { children: ReactNode; trigger: unknown }) {
  const r = useAnimatedValue(0);
  const [initial] = useState(trigger);
  useEffect(() => {
    if (trigger === initial || reduced) return;
    r.setValue(0);
    const a = Animated.sequence([0.12, -0.12, 0.08, -0.08, 0].map((v) => Animated.timing(r, { toValue: v, duration: 90, useNativeDriver: NATIVE })));
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return <Animated.View style={{ transform: [{ rotate: r.interpolate({ inputRange: [-1, 1], outputRange: ['-57deg', '57deg'] }) }] }}>{children}</Animated.View>;
}

/** Cuenta hasta el valor de un texto como «$44.200», «36%» o «3 envíos» (formato es-CO). */
export function useCountUp(text: string, duration = 900) {
  const m = /^(\D*?)(\d[\d.]*(?:,\d+)?)(.*)$/s.exec(text);
  const target = m ? Number(m[2].replace(/\./g, '').replace(',', '.')) : NaN;
  const decimals = m && m[2].includes(',') ? m[2].split(',')[1].length : 0;
  const animatable = !reduced && !!m && Number.isFinite(target);
  const fmt = (n: number) => (m ? m[1] + n.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[3] : text);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!animatable) return;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setShown(fmt(value)));
    const anim = Animated.timing(v, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start(() => setShown(text));
    return () => { anim.stop(); v.removeListener(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  if (!animatable) return text;
  return shown ?? fmt(0);
}

/** Giro lento y continuo sobre su propio eje (círculo hueco de la portada). */
export function Spin({ children, duration = 24000, style }: { children: ReactNode; duration?: number; style?: StyleProp<ViewStyle> }) {
  const r = useAnimatedValue(0);
  useEffect(() => {
    if (reduced) { r.setValue(0); return; }
    r.setValue(0);
    const loop = Animated.loop(Animated.timing(r, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [r, duration]);
  return <Animated.View style={[style, { transform: [{ rotate: r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>{children}</Animated.View>;
}

/** Tres puntos que saltan en secuencia: indica que algo está cargando (p. ej. la IA). */
export function LoadingDots({ color = '#F8F4EC', size = 8 }: { color?: string; size?: number }) {
  const t = useAnimatedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View accessibilityLabel="Cargando" style={{ flexDirection: 'row', gap: size * 0.6, alignItems: 'center', height: size * 3 }}>
      {[0, 1, 2].map((i) => {
        const a = i / 3;
        const y = t.interpolate({ inputRange: [0, a, a + 0.15, a + 0.3, 1], outputRange: [0, 0, -size, 0, 0], extrapolate: 'clamp' });
        const o = t.interpolate({ inputRange: [0, a, a + 0.15, a + 0.3, 1], outputRange: [0.4, 0.4, 1, 0.4, 0.4], extrapolate: 'clamp' });
        return <Animated.View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: o, transform: [{ translateY: y }] }} />;
      })}
    </View>
  );
}
