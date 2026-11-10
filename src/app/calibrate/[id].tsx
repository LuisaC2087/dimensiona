/** RF-12: elegir la referencia de calibración; la medición se hace en el escaneo (modo «referencia»). */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { REFERENCES, parseDecimal, formatLength } from '../../lib';
import { useAppState } from '../../state/AppState';
import { Button, Card, s } from '../../components/ui';
import { colors, minTouch, space } from '../../theme';

export default function Calibrate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { compat } = useAppState();
  const [sel, setSel] = useState<string>('tape');
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const start = () => {
    let realM: number | null;
    if (sel === 'manual') {
      const cm = parseDecimal(manual);
      realM = cm == null ? null : cm / 100;
      if (realM == null || realM <= 0.05 || realM > 10) return setMsg('Escribe la longitud real en centímetros (entre 5 y 1000).');
    } else realM = REFERENCES.find((r) => r.id === sel)!.lengthM;
    if (!compat?.canScan) return router.push('/compat');
    router.replace(`/scan/${id}?mode=reference&realM=${realM}`);
  };

  const Option = ({ value, label, detail }: { value: string; label: string; detail?: string }) => (
    <Pressable onPress={() => setSel(value)} accessibilityRole="radio" accessibilityState={{ selected: sel === value }}
      style={{ minHeight: minTouch, padding: space.md, borderRadius: 12, backgroundColor: sel === value ? colors.accent : colors.surface }}>
      <Text style={{ color: sel === value ? colors.onAccent : colors.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
      {detail && <Text style={{ color: sel === value ? colors.onAccent : colors.textMuted, fontSize: 14 }}>{detail}</Text>}
    </Pressable>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card>
        <Text style={s.body}>
          La calibración corrige la escala de todo el proyecto. Mide un objeto cuya longitud conoces: marca sus dos extremos y la app calculará el factor k.
        </Text>
      </Card>
      {REFERENCES.map((r) => <Option key={r.id} value={r.id} label={r.label} detail={formatLength(r.lengthM, 'cm', 4)} />)}
      <Option value="manual" label="Otra longitud" detail="Escribe la medida real en centímetros" />
      {sel === 'manual' && (
        <TextInput value={manual} onChangeText={setManual} keyboardType="decimal-pad" placeholder="Ej.: 120,5"
          placeholderTextColor={colors.textMuted}
          style={{ minHeight: minTouch, color: colors.text, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: space.md, fontSize: 16 }} />
      )}
      <Text style={s.muted}>Consejo: las referencias largas (cinta de 1 m) calibran mejor que las cortas.</Text>
      {msg && <Text style={{ color: colors.warn, fontSize: 15 }}>{msg}</Text>}
      <View style={{ gap: space.sm }}>
        <Button label="Medir la referencia" onPress={start} />
      </View>
    </ScrollView>
  );
}
