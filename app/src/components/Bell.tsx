/** Campana de avisos para el encabezado, con contador de no leídos. */
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useNotifications } from '../state/notifications';
import { colors, fonts } from '../theme';
import { Icon } from './Icon';
import { Pop, Shake } from './motion';

export function Bell() {
  const { unread } = useNotifications();
  const label = unread ? `Avisos, ${unread} sin leer` : 'Avisos';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/avisos')} hitSlop={8}
      style={{ width: 44, height: 44, borderWidth: 2, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
      <Shake trigger={unread}><Icon name={unread ? 'bell-ring' : 'bell-outline'} size={24} color={colors.paper} /></Shake>
      {unread > 0 && (
        <Pop trigger={unread} style={{ position: 'absolute', top: -8, right: -8 }}><View style={{ minWidth: 22, height: 22, paddingHorizontal: 4, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.paper, fontFamily: fonts.display, fontSize: 12 }}>{unread > 99 ? '99+' : unread}</Text>
        </View></Pop>
      )}
    </Pressable>
  );
}
