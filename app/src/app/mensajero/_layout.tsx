import { Tabs } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { TabBar } from '../../components/TabBar';

const ICONS = { index: 'map-marker-path', disponibles: 'hand-coin', ganancias: 'cash-multiple', cuenta: 'account-circle' } as const;

export default function MensajeroLayout() {
  return (
    <RoleGate role="mensajero">
      <Tabs tabBar={(p) => <TabBar {...p} icons={ICONS} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Mi ruta' }} />
        <Tabs.Screen name="disponibles" options={{ title: 'Disponibles' }} />
        <Tabs.Screen name="ganancias" options={{ title: 'Ganancias' }} />
        <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
      </Tabs>
    </RoleGate>
  );
}
