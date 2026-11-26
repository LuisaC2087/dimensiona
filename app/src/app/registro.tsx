import { useState } from 'react';
import { router } from 'expo-router';
import type { Role } from '../api/types';
import { Body, Button, Card, ErrorBox, Field, Header, Row, Screen, Segmented, Title, Toggle } from '../components/ui';
import { useAuth } from '../state/auth';
import { colors } from '../theme';

export default function Registro() {
  const { register } = useAuth();
  const [role, setRole] = useState<Exclude<Role, 'admin'>>('tienda');
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', city: '', storeName: '', instagram: '', address: '', vehicle: 'Moto' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accept, setAccept] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await register({ ...f, role, channel: f.instagram ? 'Instagram' : 'WhatsApp', acceptTerms: accept });
      if (r.pending) setPending(true); else router.replace('/');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <Screen header={<Header title="Solicitud enviada" onBack={() => router.replace('/login')} />}>
        <Card accent={colors.red}>
          <Title size={22}>¡Gracias, {f.name.split(' ')[0]}!</Title>
          <Body>Tu cuenta de mensajero quedó pendiente de aprobación. Cuando administración la active podrás entrar con {f.email}.</Body>
        </Card>
        <Button label="Volver a entrar" onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Crear cuenta" kicker="Únete a la red" onBack={() => router.back()} />}>
      <Segmented value={role} onChange={setRole} options={[{ value: 'tienda', label: 'Tengo un negocio' }, { value: 'mensajero', label: 'Soy mensajero' }]} />
      <Body muted>
        {role === 'tienda'
          ? 'Mide tus productos con la cámara, empaca en la caja justa y gestiona tus envíos.'
          : 'Toma envíos cerca de ti, verifica medidas con AR (realidad aumentada) y entrega. Tu cuenta se activa cuando administración la apruebe.'}
      </Body>
      {role === 'tienda' && <Field label="Nombre del emprendimiento" value={f.storeName} onChangeText={set('storeName')} placeholder="Ej: Luna Velas & Co." />}
      <Field label="Tu nombre" value={f.name} onChangeText={set('name')} autoComplete="name" />
      <Field label="Correo" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Contraseña" value={f.password} onChangeText={set('password')} secureTextEntry hint="Mínimo 8 caracteres" />
      <Field label="Celular / WhatsApp" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label="Ciudad" value={f.city} onChangeText={set('city')} placeholder="Bogotá" hint={role === 'tienda' ? 'Desde donde despachas (define la zona de tarifa)' : 'Donde haces entregas'} />
      {role === 'tienda' && <Field label="Dirección de recogida" value={f.address} onChangeText={set('address')} placeholder="Cra 15 #93-20" />}
      {role === 'tienda' && <Field label="Instagram (opcional)" value={f.instagram} onChangeText={set('instagram')} autoCapitalize="none" placeholder="@mitienda" />}
      {role === 'mensajero' && (
        <Segmented value={f.vehicle} onChange={set('vehicle')} options={[{ value: 'Moto', label: 'Moto' }, { value: 'Bicicleta', label: 'Bici' }, { value: 'Carro', label: 'Carro' }]} />
      )}
      <Toggle label="Acepto los Términos y Condiciones y autorizo el tratamiento de mis datos personales" hint="Ley 1581 de 2012. Puedes revocar la autorización y eliminar tu cuenta cuando quieras." value={accept} onChange={setAccept} />
      <Row>
        <Button small variant="outline" label="Leer términos" style={{ flex: 1 }} onPress={() => router.push('/legal/terminos')} />
        <Button small variant="outline" label="Tratamiento de datos" style={{ flex: 1 }} onPress={() => router.push('/legal/privacidad')} />
      </Row>
      <ErrorBox message={error} />
      <Button label="Crear cuenta" onPress={submit} loading={busy} disabled={!accept} />
    </Screen>
  );
}
