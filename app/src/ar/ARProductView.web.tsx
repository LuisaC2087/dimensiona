/** En la web no hay ARCore: la medición se hace con foto y objeto de referencia (/medir-foto). */
import { Text, View } from 'react-native';
import type { Ref } from 'react';
import type { ARCallbacks, ARDrawing, ARHandle } from './types';

export * from './types';

export function ARProductView(_props: { callbacks: ARCallbacks; drawing: ARDrawing; handleRef: Ref<ARHandle>; resetSignal: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414', padding: 24 }}>
      <Text style={{ color: '#EFE6D3', fontSize: 16, textAlign: 'center' }}>La realidad aumentada funciona en la app Android. En el navegador mide con una foto.</Text>
    </View>
  );
}
