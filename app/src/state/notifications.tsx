/**
 * Contador de avisos sin leer: se consulta al entrar, cada minuto y al volver a la app.
 * También registra el teléfono para notificaciones push la primera vez que se inicia sesión.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../api/client';
import { registerPush, useNotificationTaps } from '../lib/push';
import { getItem, setItem } from '../lib/storage';
import { useAuth } from './auth';

const Ctx = createContext<{ unread: number; refresh: () => void }>({ unread: 0, refresh: () => {} });
const ASKED = 'dm.pushAsked';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  useNotificationTaps();

  const refresh = useCallback(() => {
    if (!user) return;
    api.unread().then((r) => setUnread(r.unread)).catch(() => { /* sin conexión: se reintenta */ });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const t = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    (async () => {
      const asked = await getItem(ASKED);
      await registerPush(!asked); // la primera vez pide permiso; después solo renueva el token
      if (!asked) await setItem(ASKED, '1');
    })();
    return () => { clearInterval(t); sub.remove(); };
  }, [user, refresh]);

  const value = useMemo(() => ({ unread: user ? unread : 0, refresh }), [user, unread, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);
