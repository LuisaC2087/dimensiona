/**
 * Punto de entrada de la vista AR. ViroReact solo se carga si su módulo nativo existe
 * (development build / APK). En Expo Go o en web se muestra un aviso en vez de cerrar la app.
 */
import { NativeModules, Platform, Text, View } from 'react-native';
import type { ARCallbacks, ARDrawing } from './ARMeasureView';
import { colors } from '../theme';

export type { ARCallbacks, ARDrawing, ReticleHit, TrackingCause } from './ARMeasureView';

type Props = { callbacks: ARCallbacks; drawing: ARDrawing; resetSignal: number };

export const arNativeAvailable = Platform.OS === 'android' && !!NativeModules.VRTARSceneNavigatorModule;

function Fallback(_props: Props) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <Text style={{ color: colors.textMuted, fontSize: 16, textAlign: 'center' }}>
        La realidad aumentada necesita la versión instalable de DIMENSIONA (no funciona en Expo Go ni en el navegador).
      </Text>
    </View>
  );
}

export const ARMeasureView: (props: Props) => React.JSX.Element = arNativeAvailable
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./ARMeasureView').ARMeasureView
  : Fallback;
