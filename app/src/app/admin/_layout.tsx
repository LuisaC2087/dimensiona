import { Tabs } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { TabBar } from '../../components/TabBar';

const ICONS = { index: 'view-dashboard', operacion: 'truck-delivery', finanzas: 'bank', usuarios: 'account-group', mas: 'dots-grid' } as const;

export default function AdminLayout() {
  return (
    <RoleGate role="admin">
      <Tabs tabBar={(p) => <TabBar {...p} icons={ICONS} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Panel' }} />
        <Tabs.Screen name="operacion" options={{ title: 'Envíos' }} />
        <Tabs.Screen name="finanzas" options={{ title: 'Finanzas' }} />
        <Tabs.Screen name="usuarios" options={{ title: 'Usuarios' }} />
        <Tabs.Screen name="mas" options={{ title: 'Más' }} />
        <Tabs.Screen name="tarifas" options={{ title: 'Tarifas', href: null }} />
        <Tabs.Screen name="soporte" options={{ title: 'PQR', href: null }} />
        <Tabs.Screen name="bitacora" options={{ title: 'Bitácora', href: null }} />
        <Tabs.Screen name="cuenta" options={{ title: 'Cuenta', href: null }} />
        <Tabs.Screen name="mensajes" options={{ title: 'Avisos', href: null }} />
      </Tabs>
    </RoleGate>
  );
}
