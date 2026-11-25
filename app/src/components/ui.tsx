/**
 * Componentes de interfaz constructivistas: bloques con borde grueso, sombra dura desplazada,
 * títulos condensados en mayúsculas y bandas diagonales.
 */
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, MAX_WIDTH, SHADOW_OFFSET, space } from '../theme';
import type { ShipmentStatus } from '../api/types';

export function Title({ children, size = 30, color = colors.ink, style }: { children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.05, color, textTransform: 'uppercase', letterSpacing: 0.5 }, style]}>{children}</Text>;
}

export function Label({ children, color = colors.grey, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.displayMedium, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color }, style]}>{children}</Text>;
}

export function Body({ children, style, muted, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 22, color: muted ? colors.grey : colors.ink }, style]}>{children}</Text>;
}

/** Encabezado con banda roja diagonal. */
export function Header({ title, kicker, right, onBack }: { title: string; kicker?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={hs.wrap}>
      <View style={hs.band} />
      <View style={hs.row}>
        {onBack && (
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={hs.back} hitSlop={8}>
            <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 26, marginTop: -2 }}>←</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          {kicker && <Label color={colors.paper3}>{kicker}</Label>}
          <Title color={colors.paper} size={28} style={{ marginTop: 2 }}>{title}</Title>
        </View>
        {right}
      </View>
    </View>
  );
}
const hs = StyleSheet.create({
  wrap: { backgroundColor: colors.ink, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl, overflow: 'hidden' },
  band: { position: 'absolute', left: -40, right: -40, bottom: -18, height: 30, backgroundColor: colors.red, transform: [{ rotate: '-3deg' }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.paper },
});

/** Pantalla: fondo papel, ancho máximo en web, desplazamiento y recarga opcional. */
export function Screen({ children, header, scroll = true, onRefresh, refreshing = false, padded = true, footer }: {
  children: ReactNode; header?: ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean; padded?: boolean; footer?: ReactNode;
}) {
  const content = <View style={[{ gap: space.lg }, padded && { padding: space.lg, paddingBottom: space.xxl * 2 }]}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        {header}
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} colors={[colors.red]} /> : undefined}>
            {content}
          </ScrollView>
        ) : <View style={{ flex: 1 }}>{content}</View>}
        {footer}
      </View>
    </SafeAreaView>
  );
}

/** Bloque con borde grueso y sombra dura. */
export function Card({ children, style, shadow = colors.ink, onPress, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; shadow?: string; onPress?: () => void; accent?: string }) {
  const inner = (
    <View style={[cs.card, accent ? { borderLeftWidth: 10, borderLeftColor: accent } : null, style]}>{children}</View>
  );
  return (
    <View style={{ marginRight: SHADOW_OFFSET, marginBottom: SHADOW_OFFSET }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: shadow, transform: [{ translateX: SHADOW_OFFSET }, { translateY: SHADOW_OFFSET }] }]} />
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed ? { transform: [{ translateX: 3 }, { translateY: 3 }] } : null}>{inner}</Pressable>
      ) : inner}
    </View>
  );
}
const cs = StyleSheet.create({ card: { backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.ink, padding: space.lg, gap: space.sm } });

type BtnVariant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger';
export function Button({ label, onPress, variant = 'primary', disabled, loading, icon, style, small }: {
  label: string; onPress?: () => void; variant?: BtnVariant; disabled?: boolean; loading?: boolean; icon?: string; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = { primary: colors.red, ink: colors.ink, outline: colors.paper, ghost: 'transparent', danger: colors.paper }[variant];
  const fg = { primary: colors.paper, ink: colors.paper, outline: colors.ink, ghost: colors.ink, danger: colors.redDark }[variant];
  const shadow = variant === 'primary' ? colors.ink : variant === 'ink' ? colors.red : variant === 'ghost' ? 'transparent' : colors.ink;
  const off = variant === 'ghost' ? 0 : 4;
  const off_ = disabled || loading;
  return (
    <View style={[{ marginRight: off, marginBottom: off, opacity: off_ ? 0.5 : 1 }, style]}>
      {off > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: shadow, transform: [{ translateX: off }, { translateY: off }] }]} />}
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={off_} onPress={onPress}
        style={({ pressed }) => [{
          minHeight: small ? 40 : 52, paddingHorizontal: small ? space.md : space.lg, backgroundColor: bg,
          borderWidth: variant === 'ghost' ? 0 : 3, borderColor: variant === 'danger' ? colors.redDark : colors.ink,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
        }, pressed && off > 0 ? { transform: [{ translateX: 3 }, { translateY: 3 }] } : null]}>
        {loading ? <ActivityIndicator color={fg} /> : (
          <>
            {icon && <Text style={{ color: fg, fontSize: small ? 16 : 19 }}>{icon}</Text>}
            <Text style={{ color: fg, fontFamily: fonts.display, fontSize: small ? 15 : 18, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ gap: 6 }, style as StyleProp<ViewStyle>]}>
      <Label color={colors.ink}>{label}</Label>
      <TextInput
        placeholderTextColor="#8C8576"
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
        style={{
          minHeight: 50, borderWidth: 3, borderColor: error ? colors.red : colors.ink, backgroundColor: focus ? colors.white : '#F7F1E4',
          paddingHorizontal: space.md, fontSize: 17, color: colors.ink, ...(props.multiline ? { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' } : {}),
        }}
      />
      {(error || hint) && <Text style={{ fontSize: 13, color: error ? colors.redDark : colors.grey }}>{error ?? hint}</Text>}
    </View>
  );
}

/** Selector segmentado. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: 3, borderColor: colors.ink }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.ink : colors.paper, borderLeftWidth: i ? 3 : 0, borderColor: colors.ink, paddingHorizontal: 6 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 15, color: on ? colors.paper : colors.ink, textTransform: 'uppercase', textAlign: 'center' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
      <View style={{ width: 30, height: 30, borderWidth: 3, borderColor: colors.ink, backgroundColor: value ? colors.red : colors.paper, alignItems: 'center', justifyContent: 'center' }}>
        {value && <Text style={{ color: colors.paper, fontWeight: '900', fontSize: 16 }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{label}</Text>
        {hint && <Text style={{ fontSize: 13, color: colors.grey }}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

export function Stat({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: accent ? colors.red : colors.ink, padding: space.md, gap: 2 }}>
      <Label color={accent ? colors.paper : colors.paper3}>{label}</Label>
      <Title color={colors.paper} size={26}>{value}</Title>
      {sub && <Text style={{ color: accent ? colors.paper : colors.paper3, fontSize: 12 }}>{sub}</Text>}
    </View>
  );
}

export function Tag({ label, color = colors.ink, textColor = colors.paper }: { label: string; color?: string; textColor?: string }) {
  return (
    <View style={{ backgroundColor: color, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: textColor, fontFamily: fonts.displayMedium, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export const STATUS_COLOR: Record<ShipmentStatus, string> = {
  creado: colors.grey, asignado: colors.ink2, recogido: colors.ink, en_ruta: colors.red, entregado: colors.ok,
  novedad: colors.warn, devuelto: colors.redDark, cancelado: '#8C8576',
};
export function StatusTag({ status, label }: { status: ShipmentStatus; label: string }) {
  return <Tag label={label} color={STATUS_COLOR[status]} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md, marginTop: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
        <View style={{ width: 14, height: 14, backgroundColor: colors.red, transform: [{ rotate: '45deg' }] }} />
        <Title size={22}>{children}</Title>
      </View>
      {action}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.md, borderWidth: 3, borderColor: colors.ink, borderStyle: 'dashed' }}>
      <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 8, borderColor: colors.red }} />
      <Title size={20} style={{ textAlign: 'center' }}>{title}</Title>
      {body && <Body muted style={{ textAlign: 'center' }}>{body}</Body>}
      {action}
    </View>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator size="large" color={colors.red} />
      <Label>{label}</Label>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View style={{ backgroundColor: colors.red, padding: space.md, gap: space.sm }} accessibilityRole="alert">
      <Text style={{ color: colors.paper, fontSize: 15, fontWeight: '600' }}>{message}</Text>
      {onRetry && <Button label="Reintentar" variant="outline" small onPress={onRetry} />}
    </View>
  );
}

export function Row({ children, style, wrap }: { children: ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function KeyValue({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.paper3 }}>
      <Text style={{ color: colors.grey, fontSize: 15, flexShrink: 1 }}>{k}</Text>
      <Text style={{ color: colors.ink, fontSize: strong ? 18 : 15, fontWeight: strong ? '800' : '600', textAlign: 'right', flexShrink: 1 }}>{v}</Text>
    </View>
  );
}

/** Contenedor raíz para web: limita el ancho (diseño móvil) sobre un fondo de tinta con diagonal. */
export function WebFrame({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: '200%', height: 120, top: '62%', left: '-50%', backgroundColor: colors.red, transform: [{ rotate: '-10deg' }] }} />
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_WIDTH, backgroundColor: colors.paper, borderLeftWidth: 3, borderRightWidth: 3, borderColor: colors.ink }}>{children}</View>
    </View>
  );
}
