/** Indicador del estado de la nube en Inicio (RF-18). */
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useCloud, type SyncStatus } from '../state/CloudState';
import { colors } from '../theme';
import { s } from './ui';

const LABEL: Record<SyncStatus, string> = {
  disabled: 'Solo en este teléfono',
  signedOut: 'Inicia sesión para guardar en la nube',
  offline: 'Sin conexión · trabajando en el teléfono',
  syncing: 'Sincronizando…',
  synced: 'Guardado en la nube',
  error: 'Error al sincronizar · se reintentará',
};
const COLOR: Record<SyncStatus, string> = {
  disabled: colors.textMuted, signedOut: colors.warn, offline: colors.warn,
  syncing: colors.accent, synced: colors.ok, error: colors.danger,
};

export function SyncBadge() {
  const { status, pending } = useCloud();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={[s.card, s.row, { borderLeftColor: COLOR[status] }]}>
      <Text style={[s.body, { color: COLOR[status], flex: 1 }]}>☁ {LABEL[status]}</Text>
      {pending > 0 && status !== 'disabled' && <Text style={s.muted}>{pending} pendiente(s)</Text>}
    </Pressable>
  );
}
