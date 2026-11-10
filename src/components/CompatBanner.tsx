/** Banner de compatibilidad en Inicio (RF-01). */
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AR_MESSAGES } from '../device/compat';
import { useAppState } from '../state/AppState';
import { colors, space } from '../theme';
import { s } from './ui';

export function CompatBanner() {
  const { compat } = useAppState();
  if (!compat) {
    return (
      <View style={[s.card, s.row, { borderLeftColor: colors.textMuted }]}>
        <Text style={s.body}>Verificando compatibilidad…</Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const ok = compat.canScan;
  const msg = AR_MESSAGES[compat.ar];
  const color = ok ? colors.ok : compat.ar === 'unsupported' ? colors.danger : colors.warn;
  const detail = ok
    ? 'Realidad aumentada lista.'
    : compat.ar === 'supported' && compat.camera !== 'granted'
      ? 'Falta el permiso de cámara. Toca para concederlo.'
      : msg.body;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/compat')} style={[s.card, { borderLeftColor: color, gap: space.xs }]}>
      <Text style={[s.h2, { color }]}>{ok ? '● Compatible' : `● ${msg.title}`}</Text>
      <Text style={s.muted}>{detail}</Text>
    </Pressable>
  );
}
