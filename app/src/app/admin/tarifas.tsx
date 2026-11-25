/** Catálogo de cajas y tarifas por servicio y zona. */
import { useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { api } from '../../api/client';
import type { Box, Service, Zone } from '../../api/types';
import { Body, Button, Card, ErrorBox, Field, Header, Label, Loading, Row, Screen, SectionTitle, Segmented, Tag, Toggle } from '../../components/ui';
import { dims, money } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { colors, fonts } from '../../theme';

type Tab = 'cajas' | 'servicios';
const ZONES: Zone[] = ['local', 'regional', 'nacional'];
const num = (s: string) => Number(String(s).replace(',', '.'));

export default function Tarifas() {
  const [tab, setTab] = useState<Tab>('cajas');
  return (
    <Screen header={<Header title="Tarifas" kicker="Cajas y servicios" onBack={() => router.back()} />}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'cajas', label: 'Cajas' }, { value: 'servicios', label: 'Servicios' }]} />
      {tab === 'cajas' ? <Cajas /> : <Servicios />}
    </Screen>
  );
}

function Cajas() {
  const { data, error, loading, reload } = useLoad(api.adminBoxes);
  const [edit, setEdit] = useState<Partial<Box> & { id?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!edit) return;
    setErr(null);
    try {
      const b = { ...edit, length: num(String(edit.length)), width: num(String(edit.width)), height: num(String(edit.height)), maxWeight: num(String(edit.maxWeight ?? 20)), cost: num(String(edit.cost ?? 0)) };
      if (edit.id) await api.adminUpdateBox(edit.id, b); else await api.adminCreateBox(b);
      setEdit(null); await reload();
    } catch (e: any) { setErr(e.message); }
  };

  if (edit) {
    const set = (k: keyof Box) => (v: string) => setEdit((x) => ({ ...x!, [k]: v }));
    return (
      <>
        <SectionTitle>{edit.id ? 'Editar caja' : 'Nueva caja'}</SectionTitle>
        <Field label="Nombre" value={String(edit.name ?? '')} onChangeText={set('name')} />
        <Label>Medidas interiores (cm)</Label>
        <Row style={{ alignItems: 'flex-start' }}>
          <Field label="Largo" value={String(edit.length ?? '')} onChangeText={set('length')} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field label="Ancho" value={String(edit.width ?? '')} onChangeText={set('width')} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field label="Alto" value={String(edit.height ?? '')} onChangeText={set('height')} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </Row>
        <Row style={{ alignItems: 'flex-start' }}>
          <Field label="Peso máx. kg" value={String(edit.maxWeight ?? '')} onChangeText={set('maxWeight')} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field label="Costo $" value={String(edit.cost ?? '')} onChangeText={set('cost')} keyboardType="number-pad" style={{ flex: 1 }} />
        </Row>
        {edit.id && <Toggle label="Activa" value={edit.active !== false} onChange={(v) => setEdit((x) => ({ ...x!, active: v }))} />}
        <ErrorBox message={err} />
        <Button label="Guardar" onPress={save} />
        <Button label="Cancelar" variant="ghost" onPress={() => setEdit(null)} />
      </>
    );
  }
  return (
    <>
      <Button label="Nueva caja" icon="plus" onPress={() => setEdit({ name: '', maxWeight: 20, cost: 0 })} />
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.map((b) => (
        <Card key={b.id} onPress={() => setEdit(b)} accent={b.active ? colors.ink : colors.paper3}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 20 }}>{b.name}</Text>
            {!b.active && <Tag label="Inactiva" color={colors.grey} />}
          </Row>
          <Body>{dims(b.length, b.width, b.height)} · hasta {b.maxWeight} kg · {money(b.cost)}</Body>
        </Card>
      ))}
    </>
  );
}

function Servicios() {
  const { data, error, loading, reload } = useLoad(api.adminServices);
  const [edit, setEdit] = useState<Service | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!edit) return;
    setErr(null);
    try {
      const rates: Service['rates'] = {};
      for (const z of ZONES) {
        const r = edit.rates[z];
        if (r) rates[z] = { base: num(String(r.base)), perKg: num(String(r.perKg)), etaDays: num(String(r.etaDays)) };
      }
      await api.adminUpdateService(edit.id, {
        ...edit, rates, divisor: num(String(edit.divisor)), insurancePct: num(String(edit.insurancePct)), codPct: num(String(edit.codPct)), courierSharePct: num(String(edit.courierSharePct)),
      });
      setEdit(null); await reload();
    } catch (e: any) { setErr(e.message); }
  };

  if (edit) {
    const setTop = (k: keyof Service) => (v: string) => setEdit((x) => ({ ...x!, [k]: v as any }));
    const setRate = (z: Zone, k: 'base' | 'perKg' | 'etaDays') => (v: string) =>
      setEdit((x) => ({ ...x!, rates: { ...x!.rates, [z]: { ...(x!.rates[z] ?? { base: 0, perKg: 0, etaDays: 1 }), [k]: v as any } } }));
    return (
      <>
        <SectionTitle>{edit.name}</SectionTitle>
        <Field label="Nombre" value={edit.name} onChangeText={setTop('name')} />
        <Field label="Descripción" value={edit.description ?? ''} onChangeText={setTop('description')} />
        <Row style={{ alignItems: 'flex-start' }}>
          <Field label="Divisor vol." value={String(edit.divisor)} onChangeText={setTop('divisor')} keyboardType="number-pad" style={{ flex: 1 }} hint="cm³/kg" />
          <Field label="Mensajero %" value={String(edit.courierSharePct)} onChangeText={setTop('courierSharePct')} keyboardType="decimal-pad" style={{ flex: 1 }} hint="del flete" />
        </Row>
        <Row style={{ alignItems: 'flex-start' }}>
          <Field label="Seguro %" value={String(edit.insurancePct)} onChangeText={setTop('insurancePct')} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field label="Contra entrega %" value={String(edit.codPct)} onChangeText={setTop('codPct')} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </Row>
        {ZONES.map((z) => {
          const r = edit.rates[z];
          return (
            <Card key={z} accent={r ? colors.red : colors.paper3}>
              <Toggle label={`Zona ${z}`} value={!!r} onChange={(on) => setEdit((x) => {
                const rates = { ...x!.rates };
                if (on) rates[z] = { base: 10000, perKg: 2000, etaDays: 2 }; else delete rates[z];
                return { ...x!, rates };
              })} />
              {r && (
                <Row style={{ alignItems: 'flex-start' }}>
                  <Field label="Base 1 kg $" value={String(r.base)} onChangeText={setRate(z, 'base')} keyboardType="number-pad" style={{ flex: 1 }} />
                  <Field label="Kg adic. $" value={String(r.perKg)} onChangeText={setRate(z, 'perKg')} keyboardType="number-pad" style={{ flex: 1 }} />
                  <Field label="Días" value={String(r.etaDays)} onChangeText={setRate(z, 'etaDays')} keyboardType="number-pad" style={{ flex: 1 }} />
                </Row>
              )}
            </Card>
          );
        })}
        <Toggle label="Servicio activo" value={edit.active} onChange={(v) => setEdit((x) => ({ ...x!, active: v }))} />
        <ErrorBox message={err} />
        <Button label="Guardar" onPress={save} />
        <Button label="Cancelar" variant="ghost" onPress={() => setEdit(null)} />
      </>
    );
  }
  return (
    <>
      <ErrorBox message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.map((s) => (
        <Card key={s.id} onPress={() => setEdit(JSON.parse(JSON.stringify(s)))} accent={s.active ? colors.red : colors.paper3}>
          <Text style={{ fontFamily: fonts.display, fontSize: 20 }}>{s.name}</Text>
          {s.description && <Body muted>{s.description}</Body>}
          {ZONES.filter((z) => s.rates[z]).map((z) => (
            <Body key={z} style={{ fontSize: 14 }}>{z}: {money(s.rates[z]!.base)} + {money(s.rates[z]!.perKg)}/kg · {s.rates[z]!.etaDays} d</Body>
          ))}
        </Card>
      ))}
    </>
  );
}
