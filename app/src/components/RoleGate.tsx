import { Redirect, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Role } from '../api/types';
import { homeFor, useAuth } from '../state/auth';
import { colors } from '../theme';
import { Loading } from './ui';
import { TermsUpdate } from './TermsUpdate';

/** Protege una sección: sin sesión → login; con otro rol → su inicio. */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { ready, user, terms } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading /></View>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={homeFor(user.role)} />;
  if (terms && terms.accepted !== terms.current) return <TermsUpdate version={terms.current} />;
  return <>{children}</>;
}

/** Exige sesión de cualquier rol (pantallas compartidas como el detalle de un envío). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user, terms } = useAuth();
  const path = usePathname();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading /></View>;
  if (!user) return <Redirect href={{ pathname: '/login', params: { next: path } }} />;
  if (terms && terms.accepted !== terms.current) return <TermsUpdate version={terms.current} />;
  return <>{children}</>;
}
