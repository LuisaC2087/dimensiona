/** Logo DIMENSIONA: caja isométrica con cota de medida (+ palabra opcional). */
import { Text, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { colors, fonts } from '../theme';

export function LogoMark({ size = 48, negative = false }: { size?: number; negative?: boolean }) {
  const stroke = negative ? colors.paper : colors.ink;
  const left = negative ? colors.ink2 : colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="DIMENSIONA">
      <Polygon points="60,12 104,34 60,56 16,34" fill={colors.paper} stroke={stroke} strokeWidth={5} strokeLinejoin="round" />
      <Polygon points="16,34 60,56 60,100 16,78" fill={left} stroke={stroke} strokeWidth={5} strokeLinejoin="round" />
      <Polygon points="60,56 104,34 104,78 60,100" fill={colors.red} stroke={stroke} strokeWidth={5} strokeLinejoin="round" />
      <Line x1={73} y1={108.5} x2={103} y2={93.5} stroke={stroke} strokeWidth={4} />
      <Polygon points="66,112 76,112 72,104" fill={stroke} />
      <Polygon points="110,90 100,90 104,98" fill={stroke} />
    </Svg>
  );
}

export function Logo({ size = 44, negative = false, tagline = true }: { size?: number; negative?: boolean; tagline?: boolean }) {
  const c = negative ? colors.paper : colors.ink;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.22 }} accessibilityRole="image" accessibilityLabel="DIMENSIONA Smart Logistics">
      <LogoMark size={size} negative={negative} />
      <View>
        <Text style={{ fontFamily: fonts.display, fontSize: size * 0.62, lineHeight: size * 0.7, color: c, letterSpacing: 1.5 }}>DIMENSIONA</Text>
        {tagline && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ width: size * 0.5, height: size * 0.09, backgroundColor: colors.red }} />
            <Text style={{ fontFamily: fonts.displayMedium, fontSize: size * 0.2, color: c, letterSpacing: 2.5 }}>SMART LOGISTICS</Text>
          </View>
        )}
      </View>
    </View>
  );
}
