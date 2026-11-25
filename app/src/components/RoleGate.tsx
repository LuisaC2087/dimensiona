import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Role } from '../api/types';
import { homeFor, useAuth } from '../state/auth';
import { colors } from '../theme';
import { Loading } from './ui';

/** Protege una sección: sin sesión → login; con otro rol → su inicio. */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { ready, user } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading /></View>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={homeFor(user.role)} />;
  return <>{children}</>;
}
