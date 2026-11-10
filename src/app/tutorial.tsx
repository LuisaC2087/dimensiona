/** Tutorial de 3 pantallas, omitible (RF-16) + descargo (ROT-05). */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppState } from '../state/AppState';
import { Button, Disclaimer, s } from '../components/ui';
import { colors, space } from '../theme';

const PAGES = [
  { title: 'Mueve el teléfono despacio', body: 'Apunta al piso y recorre la habitación lentamente. Busca buena luz y superficies con textura; evita espejos y vidrios.' },
  { title: 'Marca las esquinas', body: 'Toca, en orden, cada punto donde una pared se une con el piso. Luego cierra el contorno y marca la altura.' },
  { title: 'Lee la confiabilidad', body: 'Cada medida trae un nivel: Alta, Media o Baja, y un rango ±. Si sale Baja, repite la medición en mejores condiciones.' },
];

export default function Tutorial() {
  const { updateSettings } = useAppState();
  const [i, setI] = useState(0);
  const finish = async () => { await updateSettings({ tutorialSeen: true }); router.replace('/'); };
  const p = PAGES[i];
  return (
    <SafeAreaView style={[s.screen, { padding: space.lg, justifyContent: 'space-between' }]}>
      <View style={s.row}>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 18 }}>DIMENSIONA</Text>
        <Button label="Omitir" variant="secondary" onPress={finish} />
      </View>
      <View style={{ gap: space.md }}>
        <Text style={{ color: colors.accent, fontSize: 48, fontWeight: '800' }}>{i + 1}/3</Text>
        <Text style={s.h1}>{p.title}</Text>
        <Text style={s.body}>{p.body}</Text>
      </View>
      <View style={{ gap: space.md }}>
        <Disclaimer />
        <Button label={i < 2 ? 'Siguiente' : 'Empezar'} onPress={() => (i < 2 ? setI(i + 1) : finish())} />
      </View>
    </SafeAreaView>
  );
}
