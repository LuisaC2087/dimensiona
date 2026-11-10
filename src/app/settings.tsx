/** Ajustes: unidades, decimales, aviso legal, acerca de (RF-15, ROT-04). */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatLength, type Unit } from '../lib';
import { useAppState } from '../state/AppState';
import { Card, Disclaimer, s } from '../components/ui';
import { colors, minTouch, space } from '../theme';

const UNITS: { u: Unit; label: string }[] = [
  { u: 'm', label: 'Metros' }, { u: 'cm', label: 'Centímetros' }, { u: 'in', label: 'Pulgadas' }, { u: 'ft-in', label: 'Pies y pulgadas' },
];

function Option({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      style={{ minHeight: minTouch, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: 999, backgroundColor: selected ? colors.accent : colors.surfaceAlt }}>
      <Text style={{ color: selected ? colors.onAccent : colors.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings } = useAppState();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card>
        <Text style={s.h2}>Unidad</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {UNITS.map(({ u, label }) => <Option key={u} label={label} selected={settings.unit === u} onPress={() => updateSettings({ unit: u })} />)}
        </View>
        <Text style={s.muted}>Ejemplo: {formatLength(2.48, settings.unit, settings.decimals)}</Text>
      </Card>
      <Card>
        <Text style={s.h2}>Decimales</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {[1, 2, 3].map((d) => <Option key={d} label={String(d)} selected={settings.decimals === d} onPress={() => updateSettings({ decimals: d })} />)}
        </View>
      </Card>
      <Card>
        <Text style={s.h2}>Privacidad</Text>
        <Text style={s.body}>
          DIMENSIONA usa la cámara solo para medir. Sin cuenta, todo queda en este teléfono. Con cuenta, tus proyectos, medidas, notas y fotos se guardan también en la nube (solo tú puedes verlos); el único dato personal es tu correo, tratado conforme a la Ley 1581 de 2012.
        </Text>
      </Card>
      <Card>
        <Text style={s.h2}>Acerca de</Text>
        <Text style={s.body}>DIMENSIONA 1.0 · Ingeniería en Desarrollo de Software · UNINPAHU · Expouninpahu 2026.</Text>
        <Pressable onPress={() => updateSettings({ tutorialSeen: false })} style={{ minHeight: minTouch, justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Ver el tutorial de nuevo</Text>
        </Pressable>
      </Card>
      <Disclaimer />
    </ScrollView>
  );
}
