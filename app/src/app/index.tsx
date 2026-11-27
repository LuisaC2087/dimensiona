import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { Platform, View } from 'react-native';
import { homeFor, useAuth } from '../state/auth';
import { Loading } from '../components/ui';
import { welcomeSeen } from '../lib/onboarding';
import { colors } from '../theme';

/** Entrada: portada (APK) o login, guía de bienvenida (primera vez) o inicio del rol. */
export default function Index() {
  const { ready, user } = useAuth();
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => { if (user) void welcomeSeen().then(setSeen); }, [user]);
  if (!ready || (user && seen === null)) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading /></View>;
  if (!user) return <Redirect href={Platform.OS === 'web' ? '/login' : '/inicio'} />;
  return <Redirect href={seen ? homeFor(user.role) : '/bienvenida'} />;
}
