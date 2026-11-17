import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME } from '../db/schema';
import { migrate } from '../db/repo';
import { ensureDemo } from '../demo/demo';
import { AppStateProvider } from '../state/AppState';
import { CloudStateProvider } from '../state/CloudState';
import { colors } from '../theme';

async function init(db: SQLiteDatabase) {
  await migrate(db);
  await ensureDemo(db);
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={init}>
      <AppStateProvider>
      <CloudStateProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'DIMENSIONA' }} />
          <Stack.Screen name="compat" options={{ title: 'Compatibilidad' }} />
          <Stack.Screen name="tutorial" options={{ title: 'Cómo medir', headerShown: false }} />
          <Stack.Screen name="new" options={{ title: 'Nuevo proyecto' }} />
          <Stack.Screen name="project/[id]" options={{ title: 'Resultados' }} />
          <Stack.Screen name="scan/[id]" options={{ title: 'Escanear', headerShown: false }} />
          <Stack.Screen name="measure" options={{ title: 'Medir', headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
          <Stack.Screen name="calibrate/[id]" options={{ title: 'Calibración' }} />
          <Stack.Screen name="account" options={{ title: 'Cuenta y nube' }} />
        </Stack>
      </CloudStateProvider>
      </AppStateProvider>
    </SQLiteProvider>
  );
}
