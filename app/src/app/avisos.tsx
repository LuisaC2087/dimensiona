/** Bandeja de avisos (todos los roles) y preferencias de notificación. */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../api/client';
import type { AppNotification, NotificationPrefs } from '../api/types';
import { Icon, type IconName } from '../components/Icon';
import { RequireAuth } from '../components/RoleGate';
import { Body, Button, Card, Empty, ErrorBox, Header, Loading, Screen, SectionTitle, Toggle } from '../components/ui';
import { dateTime } from '../lib/format';
import { pushSupported, registerPush } from '../lib/push';
import { useLoad } from '../lib/useLoad';
import { useAuth } from '../state/auth';
import { useNotifications } from '../state/notifications';
import { colors, fonts, space } from '../theme';

const KIND_ICON: Record<string, IconName> = {
  'envio.asignado': 'account-arrow-right', 'envio.recogido': 'package-variant', 'envio.en_ruta': 'truck-fast',
  'envio.entregado': 'check-decagram', 'envio.novedad': 'alert', 'envio.devuelto': 'keyboard-return', 'envio.cancelado': 'close-octagon',
  'envio.ajuste': 'ruler-square', disponible: 'map-marker-radius', asignacion: 'account-arrow-right', factura: 'file-document',
  liquidacion: 'cash-check', pqr: 'message-alert', 'pqr.respuesta': 'message-reply-text', 'mensajero.pendiente': 'account-clock',
};
const ALERT_KINDS = ['envio.novedad', 'envio.devuelto', 'envio.ajuste', 'envio.cancelado'];

function Item({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const unread = !n.read_at;
  const alert = ALERT_KINDS.includes(n.kind);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${unread ? 'Sin leer. ' : ''}${n.title}. ${n.body ?? ''}`} onPress={() => onOpen(n)}
      style={{ flexDirection: 'row', gap: space.md, padding: space.md, borderWidth: 3, borderColor: colors.ink, backgroundColor: unread ? '#fff' : colors.paper, borderLeftWidth: unread ? 10 : 3, borderLeftColor: alert ? colors.red : colors.ink }}>
      <View style={{ width: 40, height: 40, backgroundColor: alert ? colors.red : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={KIND_ICON[n.kind] ?? 'bell'} size={22} color={colors.paper} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: unread ? fonts.display : fonts.displayMedium, fontSize: 16, textTransform: 'uppercase', color: colors.ink }}>{n.title}</Text>
        {n.body && <Body>{n.body}</Body>}
        <Body muted style={{ fontSize: 12 }}>{dateTime(n.created_at)}</Body>
      </View>
      {n.link && <Icon name="chevron-right" size={22} color={colors.grey} />}
    </Pressable>
  );
}

function Prefs() {
  const { user } = useAuth();
  const { data, reload } = useLoad<NotificationPrefs>(api.notificationPrefs);
  const [msg, setMsg] = useState<string | null>(null);
  if (!data) return null;
  const set = async (b: { push?: boolean; customers?: boolean }) => { await api.setNotificationPrefs(b); reload(); };
  return (
    <>
      <SectionTitle icon="tune">Preferencias</SectionTitle>
      <Card>
        <Toggle label="Notificaciones en el teléfono" value={data.push} onChange={(v) => set({ push: v })}
          hint={pushSupported ? 'Te avisamos aunque la app esté cerrada' : 'En la web los avisos se ven aquí; en el APK llegan al teléfono'} />
        {pushSupported && data.push && (
          <Button small variant="outline" icon="cellphone-check" label="Activar en este teléfono" onPress={async () => {
            const r = await registerPush(true);
            setMsg(r === 'ok' ? 'Listo: este teléfono recibirá los avisos.' : r === 'denied'
              ? 'El permiso está bloqueado. Actívalo en Ajustes → Apps → DIMENSIONA → Notificaciones.'
              : 'Las notificaciones del teléfono aún no están disponibles en esta versión. Los avisos siguen llegando aquí.');
          }} />
        )}
        {msg && <Body muted>{msg}</Body>}
        {user?.role === 'tienda' && data.customers !== null && (
          <Toggle label="Avisar a mis clientes" value={data.customers} onChange={(v) => set({ customers: v })}
            hint={`WhatsApp${data.channels.email ? ' o correo' : ''} cuando el pedido sale, va en camino, se entrega o tiene novedad${data.channels.whatsapp === 'simulado' ? '. Por ahora en modo manual: lo envías tú con un toque desde el envío' : ''}`} />
        )}
      </Card>
    </>
  );
}

function Inbox() {
  const { refresh } = useNotifications();
  const { data, error, loading, reload, refreshing } = useLoad(api.notifications);
  const open = async (n: AppNotification) => {
    if (!n.read_at) { await api.markRead([n.id]).catch(() => {}); refresh(); reload(); }
    if (n.link) router.push(n.link as never);
  };
  const readAll = async () => { await api.markRead(); refresh(); reload(); };
  return (
    <Screen header={<Header title="Avisos" kicker={data?.unread ? `${data.unread} sin leer` : 'Al día'} icon="bell"
      onBack={router.canGoBack() ? () => router.back() : undefined} />} onRefresh={() => { reload(); refresh(); }} refreshing={refreshing}>
      {loading && !data && <Loading />}
      <ErrorBox message={error} onRetry={reload} />
      {data && data.unread > 0 && <Button small variant="outline" icon="check-all" label="Marcar todo como leído" onPress={readAll} />}
      {data && data.items.length === 0 && (
        <Empty icon="bell-check-outline" title="Sin avisos" body="Aquí verás cuando tus envíos cambien de estado, tus facturas y pagos, y las respuestas a tus PQR." />
      )}
      <View style={{ gap: space.sm }}>
        {data?.items.map((n) => <Item key={n.id} n={n} onOpen={open} />)}
      </View>
      <Prefs />
    </Screen>
  );
}

export default function Avisos() {
  return <RequireAuth><Inbox /></RequireAuth>;
}
