/**
 * RF-17 (cuenta) y RF-18 (sincronización).
 * Sincroniza: al iniciar sesión, al recuperar conexión, tras cada cambio local (con espera de 1,5 s)
 * y cada 5 min en primer plano. Sin conexión la app sigue funcionando con SQLite.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import type { Session } from '@supabase/supabase-js';
import { cloudConfigured, supabase } from '../cloud/supabase';
import { syncNow, wipeAccountData } from '../cloud/sync';
import { onLocalChange } from '../db/changes';
import { countPending } from '../db/repo';

export type SyncStatus = 'disabled' | 'signedOut' | 'offline' | 'syncing' | 'synced' | 'error';

interface CloudState {
  configured: boolean;
  email: string | null;
  status: SyncStatus;
  pending: number;
  lastSync: Date | null;
  lastError: string | null;
  /** Se incrementa cuando la sincronización trae cambios: las pantallas recargan. */
  revision: number;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: (force?: boolean) => Promise<string | null>;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<CloudState | null>(null);

/** Mensajes de Supabase en español, sin lenguaje técnico. */
function authMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo con el enlace que te enviamos y vuelve a intentar.';
  if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  if (m.includes('password') && m.includes('6')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('network') || m.includes('fetch')) return 'Sin conexión a Internet. Intenta de nuevo cuando tengas red.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  return 'No se pudo completar la operación. Intenta de nuevo.';
}

export function CloudStateProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>(cloudConfigured ? 'signedOut' : 'disabled');
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(async () => setPending(await countPending(db)), [db]);

  const run = useCallback(async () => {
    await refreshPending();
    if (!supabase) return setStatus('disabled');
    if (!session) return setStatus('signedOut');
    if (!online) return setStatus('offline');
    setStatus('syncing');
    try {
      await syncNow(db, supabase, session.user.id);
      setLastSync(new Date());
      setLastError(null);
      setStatus('synced');
      setRevision((r) => r + 1);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    } finally {
      await refreshPending();
    }
  }, [db, session, online, refreshPending]);

  // Sesión
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Conectividad
  useEffect(() => NetInfo.addEventListener((st) => setOnline(!!st.isConnected && st.isInternetReachable !== false)), []);

  // Sincronizar al iniciar sesión / recuperar red
  useEffect(() => { run(); }, [run]);

  // Cambios locales → sincronización diferida
  useEffect(() => onLocalChange(() => {
    refreshPending();
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => run(), 1500);
  }), [run, refreshPending]);

  // Respaldo periódico
  useEffect(() => {
    const t = setInterval(() => run(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [run]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'La nube no está configurada en esta versión.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? authMessage(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'La nube no está configurada en esta versión.';
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return authMessage(error.message);
    return data.session ? null : 'Te enviamos un correo de confirmación. Ábrelo y luego inicia sesión.';
  }, []);

  const signOut = useCallback(async (force = false) => {
    if (!supabase) return null;
    const n = await countPending(db);
    if (n > 0 && !force) {
      return `Hay ${n} cambio(s) sin subir a la nube. Conéctate a Internet y espera a que se sincronicen, o confirma para perderlos.`;
    }
    await supabase.auth.signOut();
    await wipeAccountData(db);
    setRevision((r) => r + 1);
    await refreshPending();
    return null;
  }, [db, refreshPending]);

  return (
    <Ctx.Provider value={{
      configured: cloudConfigured, email: session?.user.email ?? null, status, pending, lastSync, lastError,
      revision, signIn, signUp, signOut, syncNow: run,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCloud(): CloudState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCloud fuera de CloudStateProvider');
  return v;
}
