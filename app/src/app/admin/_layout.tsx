import { Tabs } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { TabBar } from '../../components/TabBar';

export default function AdminLayout() {
  return (
    <RoleGate role="admin">
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Panel' }} />
        <Tabs.Screen name="operacion" options={{ title: 'Envíos' }} />
        <Tabs.Screen name="usuarios" options={{ title: 'Usuarios' }} />
        <Tabs.Screen name="tarifas" options={{ title: 'Tarifas' }} />
        <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
      </Tabs>
    </RoleGate>
  );
}
