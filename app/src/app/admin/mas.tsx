/** Menú de administración: configuración, soporte y cuenta. */
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { api, getBaseUrl } from '../../api/client';
import { Header, ListItem, Screen, SectionTitle, Tag } from '../../components/ui';
import { useLoad } from '../../lib/useLoad';
import { colors } from '../../theme';

export default function Mas() {
  const { data } = useLoad(api.config);
  return (
    <Screen header={<Header title="Más" kicker="Administración" icon="dots-grid" />}>
      <SectionTitle icon="cog">Configuración</SectionTitle>
      <ListItem icon="package-variant-closed" title="Cajas y tarifas" sub="Catálogo de cajas, servicios y precios por zona" onPress={() => router.push('/admin/tarifas')} />
      <SectionTitle icon="truck-check">Transportadoras</SectionTitle>
      {data?.carriers.filter((c) => c.id !== 'propia').map((c) => (
        <ListItem key={c.id} icon="truck-fast" title={c.name}
          sub={c.mode === 'real' ? 'Conectada con credenciales del contrato' : 'Modo simulado: agrega las credenciales del contrato en el servidor para conectarla'}
          right={<Tag label={c.mode === 'real' ? 'Conectada' : 'Simulada'} color={c.mode === 'real' ? colors.ok : colors.warn} />} />
      ))}
      <SectionTitle icon="bell">Avisos</SectionTitle>
      <ListItem icon="message-text-fast" title="Avisos a clientes" sub={data?.notifications?.whatsapp === 'real' ? 'WhatsApp conectado · registro de mensajes' : 'WhatsApp en modo manual · registro de mensajes'}
        onPress={() => router.push('/admin/mensajes')}
        right={<Tag label={data?.notifications?.whatsapp === 'real' ? 'Conectado' : 'Manual'} color={data?.notifications?.whatsapp === 'real' ? colors.ok : colors.warn} />} />
      <SectionTitle icon="lifebuoy">Soporte y control</SectionTitle>
      <ListItem icon="message-alert" title="PQR" sub="Peticiones, quejas y reclamos (plazo 15 días hábiles)" onPress={() => router.push('/admin/soporte')} />
      <ListItem icon="history" title="Bitácora" sub="Pagos, facturación y cambios de usuarios" onPress={() => router.push('/admin/bitacora')} />
      <ListItem icon="palette-swatch" title="Manual de marca" sub="Logo, colores y tipografía" onPress={() => { const u = `${getBaseUrl() || (Platform.OS === 'web' ? globalThis.location?.origin ?? '' : '')}/marca`; if (Platform.OS === 'web') globalThis.open?.(u, '_blank'); else void Linking.openURL(u); }} />
      <SectionTitle icon="account">Cuenta</SectionTitle>
      <ListItem icon="account-circle" title="Mi cuenta" sub="Datos, contraseña y sesión" onPress={() => router.push('/admin/cuenta')} />
    </Screen>
  );
}
