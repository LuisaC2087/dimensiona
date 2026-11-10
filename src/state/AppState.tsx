/** Estado global: compatibilidad del dispositivo (RF-01) y ajustes (RF-15). */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { checkCompatibility, type CompatResult } from '../device/compat';
import { getSettings, saveSettings, type Settings } from '../db/repo';

interface AppState {
  compat: CompatResult | null;
  recheck: () => Promise<CompatResult>;
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [compat, setCompat] = useState<CompatResult | null>(null);
  const [settings, setSettings] = useState<Settings>({ unit: 'm', decimals: 2, tutorialSeen: true });

  const recheck = useCallback(async () => {
    setCompat(null);
    const r = await checkCompatibility();
    setCompat(r);
    return r;
  }, []);

  useEffect(() => {
    recheck();
    getSettings(db).then(setSettings);
  }, [db, recheck]);

  const updateSettings = useCallback(async (s: Partial<Settings>) => {
    await saveSettings(db, s);
    setSettings((cur) => ({ ...cur, ...s }));
  }, [db]);

  return <Ctx.Provider value={{ compat, recheck, settings, updateSettings }}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState fuera de AppStateProvider');
  return v;
}
