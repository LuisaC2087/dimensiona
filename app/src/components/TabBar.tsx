/** Barra de pestañas constructivista con íconos (igual en web y Android). */
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Icon, type IconName } from './Icon';
import { Pop } from './motion';
import { TourTarget } from '../tour/TourTarget';

export function TabBar({ state, descriptors, navigation, icons }: any & { icons: Record<string, IconName> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.ink, borderTopWidth: 6, borderTopColor: colors.red, paddingBottom: insets.bottom }} accessibilityRole="tablist">
      {state.routes.map((route: any, i: number) => {
        const { options } = descriptors[route.key];
        // Solo se muestran las pestañas declaradas con ícono (las demás son pantallas internas).
        if (!(route.name in icons)) return null;
        const focused = state.index === i;
        const label = options.title ?? route.name;
        return (
          <TourTarget key={route.key} id={`tab.${route.name}`} style={{ flex: 1 }}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, minHeight: 62, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: focused ? colors.red : 'transparent' }}>
            <Pop trigger={focused ? 'on' : 'off'}><Icon name={(icons as Record<string, IconName>)[route.name] ?? 'circle-outline'} size={24} color={focused ? colors.paper : colors.paper3} /></Pop>
            <Text numberOfLines={1} style={{ color: colors.paper, fontFamily: fonts.displayMedium, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', opacity: focused ? 1 : 0.8 }}>{label}</Text>
          </Pressable>
          </TourTarget>
        );
      })}
    </View>
  );
}
