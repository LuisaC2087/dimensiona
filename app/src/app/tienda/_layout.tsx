import { Tabs } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { TabBar } from '../../components/TabBar';

const ICONS = { index: 'view-dashboard', productos: 'cube-outline', envios: 'truck-delivery', facturas: 'receipt', cuenta: 'account-circle' } as const;

export default function TiendaLayout() {
  return (
    <RoleGate role="tienda">
      <Tabs tabBar={(p) => <TabBar {...p} icons={ICONS} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="productos" options={{ title: 'Productos' }} />
        <Tabs.Screen name="envios" options={{ title: 'Envíos' }} />
        <Tabs.Screen name="facturas" options={{ title: 'Facturas' }} />
        <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
      </Tabs>
    </RoleGate>
  );
}
