import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, loadClientState, setToken, setUnauthorizedHandler } from '../api/client';
import type { Role, StoreProfile, User } from '../api/types';
import { View } from 'react-native';
import { Loading } from '../components/ui';
import { colors } from '../theme';

interface AuthState {
  ready: boolean;
  user: User | null;
  store: StoreProfile | null;
  terms: { accepted: string | null; current: string } | null;
  login: (email: string, password: string) => Promise<void>;
  register: (b: Record<string, unknown>) => Promise<{ pending: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const homeFor = (role: Role): '/tienda' | '/mensajero' | '/admin' => (role === 'tienda' ? '/tienda' : role === 'mensajero' ? '/mensajero' : '/admin');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [terms, setTerms] = useState<{ accepted: string | null; current: string } | null>(null);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
    setStore(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api.me();
    setUser(me.user);
    setStore(me.store);
    setTerms(me.terms ?? null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { void logout(); });
    (async () => {
      const { token } = await loadClientState();
      if (token) {
        try { await refresh(); } catch (e: any) { if (e?.status === 401 || e?.status === 403) await logout(); }
      }
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    await setToken(r.token);
    await refresh();
  }, [refresh]);

  const register = useCallback(async (b: Record<string, unknown>) => {
    const r = await api.register(b);
    if (r.pending || !r.token) return { pending: true };
    await setToken(r.token);
    await refresh();
    return { pending: false };
  }, [refresh]);

  const value = useMemo(() => ({ ready, user, store, terms, login, register, logout, refresh }), [ready, user, store, terms, login, register, logout, refresh]);
  // Nada se monta hasta cargar la sesión guardada: evita pedir datos sin token (enlaces directos, recargas).
  return <Ctx.Provider value={value}>{ready ? children : <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><Loading /></View>}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}
