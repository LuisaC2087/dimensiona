import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** Carga datos al enfocar la pantalla; expone recarga y estado. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  const run = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Carga al enfocar y cada vez que cambian las dependencias.
  const depsKey = JSON.stringify(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void run(); }, [run, depsKey]));

  return { data, error, loading, refreshing, reload: () => run(true), setData };
}
