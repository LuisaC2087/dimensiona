import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Oswald_500Medium, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../state/auth';
import { NotificationsProvider } from '../state/notifications';
import { Loading, WebFrame } from '../components/ui';
import { colors } from '../theme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Oswald_500Medium, Oswald_700Bold });
  const body = !fontsLoaded && !fontError ? (
    <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading label="DIMENSIONA" /></View>
  ) : (
    <AuthProvider>
      <NotificationsProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }}>
        <Stack.Screen name="medir" options={{ animation: 'fade' }} />
      </Stack>
      </NotificationsProvider>
    </AuthProvider>
  );
  return (
    <SafeAreaProvider>
      {Platform.OS === 'web' ? <WebFrame>{body}</WebFrame> : body}
    </SafeAreaProvider>
  );
}
