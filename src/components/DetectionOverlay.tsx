/**
 * CR-04/CR-05: objetos reconocidos sobre la cámara, discretos para no taparla.
 * Cada objeto lleva una etiqueta pequeña con su nombre; el seleccionado (al tocarlo) lleva esquinas amarillas.
 * La medida se muestra en la línea de resultado de la pantalla.
 */
import { Text, View } from 'react-native';
import { labelEs } from '../lib';
import type { Recognized } from '../state/useObjectRecognition';
import { colors } from '../theme';

const C = 18; // largo de cada esquina (dp)

function Corners() {
  const b = { position: 'absolute', width: C, height: C, borderColor: colors.accent } as const;
  return (
    <>
      <View style={[b, { left: -2, top: -2, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8 }]} />
      <View style={[b, { right: -2, top: -2, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8 }]} />
      <View style={[b, { left: -2, bottom: -2, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 8 }]} />
      <View style={[b, { right: -2, bottom: -2, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 8 }]} />
    </>
  );
}

export function DetectionOverlay({ items }: { items: Recognized[] }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {items.map((d, i) => (
        <View key={`${d.label}${i}`} style={{
          position: 'absolute', left: d.box.x, top: d.box.y, width: d.box.width, height: d.box.height,
          borderWidth: d.selected ? 0 : 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 8,
        }}>
          {d.selected && <Corners />}
          <Text numberOfLines={1} style={{
            position: 'absolute', top: 4, left: 4, maxWidth: 200, overflow: 'hidden',
            backgroundColor: d.selected ? colors.accent : 'rgba(11,11,12,0.6)',
            color: d.selected ? colors.onAccent : colors.text, fontWeight: '700', fontSize: 14,
            paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
          }}>
            {labelEs(d.label)}
          </Text>
        </View>
      ))}
    </View>
  );
}
