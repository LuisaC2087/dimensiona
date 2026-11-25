import { Tabs } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { TabBar } from '../../components/TabBar';

export default function TiendaLayout() {
  return (
    <RoleGate role="tienda">
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="productos" options={{ title: 'Productos' }} />
        <Tabs.Screen name="envios" options={{ title: 'Envíos' }} />
        <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
      </Tabs>
    </RoleGate>
  );
}
