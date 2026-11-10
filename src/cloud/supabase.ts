/** Cliente Supabase (RF-17, RF-18). Si no hay configuración, la app funciona solo en local. */
import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const cloudConfigured = !!url && !!key;

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: localStorage, // sesión persistida en SQLite del dispositivo
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Refrescar el token solo con la app en primer plano (recomendación de Supabase para RN).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
