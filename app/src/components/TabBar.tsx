/** Barra de pestañas constructivista (propia, igual en web y Android). */
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

export const TAB_ICONS: Record<string, string> = {
  index: '■', productos: '▲', envios: '▶', cuenta: '●', disponibles: '◆', ganancias: '$', operacion: '▶', usuarios: '●', tarifas: '▲', panel: '■', ruta: '▶',
};

export function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.ink, borderTopWidth: 6, borderTopColor: colors.red, paddingBottom: insets.bottom }}>
      {state.routes.map((route: any, i: number) => {
        const { options } = descriptors[route.key];
        if (options.href === null) return null;
        const focused = state.index === i;
        const label = options.title ?? route.name;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: focused ? colors.red : 'transparent' }}>
            <Text style={{ color: focused ? colors.paper : colors.paper3, fontSize: 16 }}>{TAB_ICONS[route.name] ?? '■'}</Text>
            <Text style={{ color: colors.paper, fontFamily: fonts.displayMedium, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: focused ? 1 : 0.75 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
