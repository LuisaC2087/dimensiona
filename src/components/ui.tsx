import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { levelFor, uncertainty, formatLength, type ReliabilityLevel, type Unit } from '../lib';
import { colors, font, levelColors, minTouch, space } from '../theme';

export function Button(props: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const v = props.variant ?? 'primary';
  const bg = v === 'primary' ? colors.accent : v === 'danger' ? colors.danger : colors.surfaceAlt;
  const fg = v === 'secondary' ? colors.text : colors.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: props.disabled ? 0.45 : pressed ? 0.8 : 1 }, props.style]}
    >
      {props.loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{props.label}</Text>}
    </Pressable>
  );
}

/** Chip de confiabilidad (RF-09). */
export function ReliabilityChip({ score, partial }: { score: number; partial?: boolean }) {
  const level = levelFor(score);
  return (
    <View style={[s.chip, { borderColor: levelColors[level] }]} accessibilityLabel={`Confiabilidad ${level} ${Math.round(score)}`}>
      <View style={[s.dot, { backgroundColor: levelColors[level] }]} />
      <Text style={s.chipText}>
        {level} {Math.round(score)}{partial ? ' · parcial' : ''}
      </Text>
    </View>
  );
}

/** Valor con rango ± (RF-13) y confiabilidad (RNF-15). */
export function ValueWithRange({ valueM, score, unit, decimals }: { valueM: number; score: number; unit: Unit; decimals: number }) {
  const level: ReliabilityLevel = levelFor(score);
  const u = uncertainty(valueM, level);
  return (
    <View style={s.row}>
      <Text style={s.value}>
        {formatLength(valueM, unit, decimals)}
        <Text style={s.muted}> ± {formatLength(u, unit, decimals)}</Text>
      </Text>
      <ReliabilityChip score={score} />
    </View>
  );
}

/** ROT-05. */
export function Disclaimer() {
  return (
    <Text style={s.disclaimer}>
      Las medidas son estimaciones; no sustituyen instrumentos profesionales.
    </Text>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.md, gap: space.md },
  h1: { color: colors.text, fontSize: font.title, fontWeight: '700' },
  h2: { color: colors.text, fontSize: font.body + 2, fontWeight: '700' },
  body: { color: colors.text, fontSize: font.body, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: font.small },
  value: { color: colors.text, fontSize: font.body + 2, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  btn: { minHeight: minTouch, borderRadius: 12, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: font.body, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: space.md, gap: space.sm, borderLeftWidth: 4, borderLeftColor: colors.accent },
  disclaimer: { color: colors.textMuted, fontSize: font.small, fontStyle: 'italic', textAlign: 'center' },
});
