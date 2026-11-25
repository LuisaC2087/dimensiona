import { Tabs } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { TabBar } from '../../components/TabBar';

export default function MensajeroLayout() {
  return (
    <RoleGate role="mensajero">
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Mi ruta' }} />
        <Tabs.Screen name="disponibles" options={{ title: 'Disponibles' }} />
        <Tabs.Screen name="ganancias" options={{ title: 'Ganancias' }} />
        <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
      </Tabs>
    </RoleGate>
  );
}
