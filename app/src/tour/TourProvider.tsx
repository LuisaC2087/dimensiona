/**
 * Recorrido guiado: la app navega sola por las pantallas de un rol. Una mano señala cada opción
 * y la «presiona» para avanzar, mientras una tarjeta explica qué se ve, con Anterior y Siguiente.
 * Se reproduce solo (se puede pausar) y respeta «Reducir movimiento».
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { FadeIn, NATIVE, reduceMotion, useAnimatedValue } from '../components/motion';
import { useAuth } from '../state/auth';
import { colors, fonts, space } from '../theme';
import { ROLE_NAME, TOURS, type TourCtx, type TourRole, type TourStep } from './steps';
import { measureTarget, type Rect } from './TourTarget';

interface Active { role: TourRole; steps: TourStep[]; ctx: TourCtx }
const Ctx = createContext<{ start: (role: TourRole) => Promise<void>; active: boolean }>({ start: async () => {}, active: false });
export const useTour = () => useContext(Ctx);

const routeOf = (s: TourStep, c: TourCtx) => (typeof s.route === 'string' ? s.route : s.route(c));
const readMs = (s: TourStep) => Math.max(4500, s.text.length * 55);

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, login } = useAuth();
  const [tour, setTour] = useState<Active | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [pressing, setPressing] = useState(false);
  const [box, setBox] = useState({ h: 800 });
  const rootRef = useRef<View>(null);

  const finger = useAnimatedValue(0); // 0 = abajo, 1 = sobre la opción
  const tap = useAnimatedValue(0);

  const go = useCallback((n: number) => { setRect(null); setReady(false); setPressing(false); setI(n); }, []);
  const stop = useCallback(() => { setTour(null); setRect(null); setReady(false); }, []);

  const start = useCallback(async (role: TourRole) => {
    const ctx: TourCtx = {};
    try {
      if (role === 'tienda') { const l = await api.shipments(); ctx.shipmentId = l[0]?.id; ctx.code = l[0]?.code; }
      if (role === 'mensajero') { const a = await api.available(); ctx.availableId = a[0]?.id ?? (await api.shipments())[0]?.id; }
    } catch { /* sin datos: se omiten esos pasos */ }
    const steps = TOURS[role].filter((s) => routeOf(s, ctx));
    setPlaying(true);
    setTour({ role, steps, ctx });
    go(0);
  }, [go]);

  // Llegar a la pantalla del paso y medir la opción a señalar.
  useEffect(() => {
    if (!tour) return;
    const step = tour.steps[i];
    const route = routeOf(step, tour.ctx);
    if (route) router.navigate(route as Href);
    let alive = true;
    const t = setTimeout(async () => {
      const r = step.target ? await measureTarget(step.target) : null;
      const origin = await new Promise<{ x: number; y: number; h: number }>((res) => {
        if (!rootRef.current) return res({ x: 0, y: 0, h: 800 });
        rootRef.current.measureInWindow((x, y, _w, h) => res({ x, y, h }));
      });
      if (!alive) return;
      setBox({ h: origin.h });
      setRect(r ? { x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h } : null);
      setReady(true);
    }, 850);
    return () => { alive = false; clearTimeout(t); };
  }, [tour, i]);

  // La mano llega a la opción.
  useEffect(() => {
    finger.setValue(0);
    if (!ready || !rect) return;
    if (reduceMotion()) { finger.setValue(1); return; }
    const a = Animated.timing(finger, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [ready, rect, finger]);

  const last = tour ? i >= tour.steps.length - 1 : false;
  const next = useCallback(() => {
    if (!tour || pressing) return;
    if (last) { setPlaying(false); return; }
    const step = tour.steps[i];
    if (step.press && rect && !reduceMotion()) {
      setPressing(true);
      tap.setValue(0);
      Animated.timing(tap, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }).start(() => go(i + 1));
    } else go(i + 1);
  }, [tour, pressing, last, i, rect, tap, go]);

  // Reproducción automática.
  useEffect(() => {
    if (!tour || !ready || !playing || last) return;
    const step = tour.steps[i];
    const t = setTimeout(next, step.press ? 2600 : readMs(step));
    return () => clearTimeout(t);
  }, [tour, ready, playing, last, i, next]);

  const switchTo = async (role: TourRole) => {
    stop();
    await login(role === 'mensajero' ? 'mensajero@demo.app' : 'tienda@demo.app', 'demo1234');
    await start(role);
  };

  const value = useMemo(() => ({ start, active: !!tour }), [start, tour]);
  const step = tour?.steps[i];
  const demo = !!user?.email.endsWith('@demo.app');
  const cardOnTop = !!rect && rect.y + rect.h / 2 > box.h * 0.5;
  const cx = rect ? rect.x + rect.w / 2 : 0, cy = rect ? rect.y + rect.h / 2 : 0;

  return (
    <Ctx.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {tour && step && (
          <View ref={rootRef} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
            {rect && (
              <>
                <View pointerEvents="none" style={{ position: 'absolute', left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12, borderWidth: 4, borderColor: colors.red }} />
                <Animated.View pointerEvents="none" style={{
                  position: 'absolute', left: cx - 30, top: cy - 30, width: 60, height: 60, borderRadius: 30, borderWidth: 4, borderColor: colors.red,
                  opacity: tap.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
                  transform: [{ scale: tap.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.8] }) }],
                }} />
                <Animated.View pointerEvents="none" style={{
                  position: 'absolute', left: cx - 12, top: cy - 4,
                  transform: [
                    { translateY: finger.interpolate({ inputRange: [0, 1], outputRange: [Math.max(160, box.h - cy), 0] }) },
                    { scale: tap.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0.78, 1] }) },
                  ],
                }}>
                  <Icon name="hand-pointing-up" size={48} color={colors.ink} />
                  <View style={{ position: 'absolute', left: 2, top: 2, zIndex: -1 }}><Icon name="hand-pointing-up" size={48} color={colors.paper} /></View>
                </Animated.View>
              </>
            )}
            <View style={{ position: 'absolute', left: space.md, right: space.md, ...(cardOnTop ? { top: space.md } : { bottom: space.md }) }}>
              <View style={{ position: 'absolute', left: 6, top: 6, right: -6, bottom: -6, backgroundColor: colors.red }} />
              <View style={{ backgroundColor: colors.ink, borderWidth: 3, borderColor: colors.ink, padding: space.md, gap: space.sm }} accessibilityRole="summary">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ flex: 1, color: colors.red, fontFamily: fonts.displayMedium, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Recorrido · {ROLE_NAME[tour.role]} · {i + 1} de {tour.steps.length}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pausar' : 'Reproducir'} hitSlop={8} onPress={() => setPlaying((p) => !p)}>
                    <Icon name={playing ? 'pause-circle' : 'play-circle'} size={26} color={colors.paper} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Salir del recorrido" hitSlop={8} onPress={stop}>
                    <Icon name="close" size={24} color={colors.paper} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {tour.steps.map((_, k) => <View key={k} style={{ flex: 1, height: 4, backgroundColor: k <= i ? colors.red : '#3A3833' }} />)}
                </View>
                <FadeIn key={i} distance={8}>
                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                    <Icon name={step.icon} size={24} color={colors.red} />
                    <Text style={{ flex: 1, color: colors.paper, fontFamily: fonts.display, fontSize: 20, textTransform: 'uppercase' }}>{step.title}</Text>
                  </View>
                  <Text style={{ color: '#DDD3BE', fontSize: 15, lineHeight: 21, marginTop: 4 }}>{step.text}</Text>
                </FadeIn>
                {last ? (
                  <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                    {demo && tour.role !== 'admin' && (
                      <TourBtn primary label={tour.role === 'tienda' ? 'Seguir como mensajero' : 'Volver a la tienda'}
                        onPress={() => void switchTo(tour.role === 'tienda' ? 'mensajero' : 'tienda')} />
                    )}
                    <TourBtn label="Anterior" onPress={() => go(i - 1)} />
                    <TourBtn primary={!demo || tour.role === 'admin'} label="Terminar" onPress={stop} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <TourBtn label="Anterior" disabled={i === 0 || pressing} onPress={() => go(i - 1)} />
                    <TourBtn primary label={step.press && rect ? 'Siguiente ›' : 'Siguiente'} disabled={pressing} onPress={next} />
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </Ctx.Provider>
  );
}

function TourBtn({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1, minHeight: 44, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? colors.red : 'transparent', borderWidth: 2, borderColor: primary ? colors.red : colors.paper,
        opacity: disabled ? 0.4 : 1, transform: pressed ? [{ translateY: 2 }] : [],
      })}>
      <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
    </Pressable>
  );
}
