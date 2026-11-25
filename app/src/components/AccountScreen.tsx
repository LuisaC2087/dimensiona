import { useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import { revokeAiConsent } from '../lib/consent';
import { resetWelcome } from '../lib/onboarding';
import { router } from 'expo-router';
import { api, getBaseUrl } from '../api/client';
import { useAuth } from '../state/auth';
import { colors } from '../theme';
import { Body, Button, Card, ErrorBox, Field, Header, KeyValue, ListItem, Screen, SectionTitle, Segmented, Tag } from './ui';

const ROLE_LABEL = { tienda: 'Emprendedor / Tienda', mensajero: 'Mensajero', admin: 'Administrador' } as const;

function confirm(title: string, msg: string, ok: () => void) {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) ok(); return; }
  Alert.alert(title, msg, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí', style: 'destructive', onPress: ok }]);
}

export function AccountScreen({ onBack }: { onBack?: () => void } = {}) {
  const { user, store, logout, refresh } = useAuth();
  const [f, setF] = useState({
    name: user?.name ?? '', phone: user?.phone ?? '', city: user?.city ?? '', vehicle: user?.vehicle ?? 'Moto',
    storeName: store?.name ?? '', storeCity: store?.city ?? '', address: store?.address ?? '', instagram: store?.instagram ?? '', whatsapp: store?.whatsapp ?? '',
  });
  const [pwd, setPwd] = useState({ password: '', newPassword: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      await api.updateMe({ name: f.name, phone: f.phone, city: f.city, vehicle: f.vehicle });
      if (user.role === 'tienda') await api.updateStore({ name: f.storeName, city: f.storeCity, address: f.address, instagram: f.instagram, whatsapp: f.whatsapp });
      await refresh();
      setMsg('Datos guardados');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const changePwd = async () => {
    setError(null); setMsg(null);
    try { await api.updateMe(pwd); setPwd({ password: '', newPassword: '' }); setMsg('Contraseña actualizada'); } catch (e: any) { setError(e.message); }
  };

  const out = async () => { await logout(); router.replace('/login'); };

  return (
    <Screen header={<Header title="Cuenta" kicker={ROLE_LABEL[user.role]} icon="account-circle" onBack={onBack} />}>
      <Card accent={colors.red}>
        <Tag label={ROLE_LABEL[user.role]} color={colors.red} />
        <KeyValue k="Correo" v={user.email} />
        <KeyValue k="Servidor" v={getBaseUrl() || 'este sitio'} />
        <KeyValue k="Versión de la app" v={Constants.expoConfig?.version ?? '—'} />
      </Card>

      {user.role === 'tienda' && (
        <>
          <SectionTitle>Mi negocio</SectionTitle>
          <Field label="Nombre del emprendimiento" value={f.storeName} onChangeText={set('storeName')} />
          <Field label="Ciudad de despacho" value={f.storeCity} onChangeText={set('storeCity')} hint="Define si tus envíos son locales, regionales o nacionales" />
          <Field label="Dirección de recogida" value={f.address} onChangeText={set('address')} />
          <Field label="Instagram" value={f.instagram} onChangeText={set('instagram')} autoCapitalize="none" />
          <Field label="WhatsApp del negocio" value={f.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" />
        </>
      )}

      <SectionTitle>Mis datos</SectionTitle>
      <Field label="Nombre" value={f.name} onChangeText={set('name')} />
      <Field label="Celular" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label="Ciudad" value={f.city} onChangeText={set('city')} />
      {user.role === 'mensajero' && (
        <Segmented value={f.vehicle} onChange={set('vehicle')} options={[{ value: 'Moto', label: 'Moto' }, { value: 'Bicicleta', label: 'Bici' }, { value: 'Carro', label: 'Carro' }]} />
      )}
      <ErrorBox message={error} />
      {msg && <Body style={{ color: colors.ok, fontWeight: '700' }}>{msg}</Body>}
      <Button label="Guardar cambios" icon="content-save" onPress={save} loading={busy} />

      <SectionTitle>Contraseña</SectionTitle>
      <Field label="Contraseña actual" value={pwd.password} onChangeText={(v) => setPwd((p) => ({ ...p, password: v }))} secureTextEntry />
      <Field label="Contraseña nueva" value={pwd.newPassword} onChangeText={(v) => setPwd((p) => ({ ...p, newPassword: v }))} secureTextEntry hint="Mínimo 8 caracteres" />
      <Button label="Cambiar contraseña" variant="outline" onPress={changePwd} disabled={!pwd.password || !pwd.newPassword} />

      <SectionTitle icon="lifebuoy">Ayuda</SectionTitle>
      <ListItem icon="school" title="Ver la guía de bienvenida" sub="Cómo funciona DIMENSIONA para tu rol" onPress={async () => { await resetWelcome(); router.push('/bienvenida'); }} />
      <ListItem icon="message-alert-outline" title="PQR" sub="Peticiones, quejas, reclamos y sugerencias" onPress={() => router.push('/pqr')} />

      <SectionTitle icon="shield-lock">Privacidad y legal</SectionTitle>
      <Button label="Términos y Condiciones" variant="outline" onPress={() => router.push('/legal/terminos')} />
      <Button label="Tratamiento de datos" variant="outline" onPress={() => router.push('/legal/privacidad')} />
      <Button label="Descargar mis datos" variant="outline" onPress={async () => {
        setError(null);
        try {
          const data = await api.exportMe();
          const json = JSON.stringify(data, null, 2);
          if (Platform.OS === 'web') {
            const a = globalThis.document?.createElement('a');
            if (a) { a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'mis-datos-dimensiona.json'; a.click(); }
          } else await Share.share({ message: json, title: 'Mis datos DIMENSIONA' });
        } catch (e: any) { setError(e.message); }
      }} />
      <Button label="Revocar permiso de IA" variant="ghost" onPress={async () => { await revokeAiConsent(); setMsg('Permiso de IA revocado'); }} />

      <SectionTitle>Sesión</SectionTitle>
      <Button label="Cerrar sesión" icon="logout" variant="ink" onPress={out} />
      {user.role !== 'admin' && (
        <Button label="Eliminar mi cuenta y datos" variant="danger" onPress={() => confirm('Eliminar cuenta', 'Se borrarán tu cuenta, productos y envíos. No se puede deshacer.', async () => {
          try { await api.deleteMe(); await out(); } catch (e: any) { setError(e.message); }
        })} />
      )}
    </Screen>
  );
}
