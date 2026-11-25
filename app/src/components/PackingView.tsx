/** Vista isométrica del paquete: la caja en alambre y cada producto como bloque sólido. */
import { View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import type { PackageInfo } from '../api/types';
import { iso } from '../lib/measure';
import { colors } from '../theme';

const PALETTE = [
  { top: '#E8493F', left: '#B11E17', right: '#D7261E' },
  { top: '#4A4744', left: '#141414', right: '#2A2826' },
  { top: '#F6EEDD', left: '#CBBF9F', right: '#E4D8BE' },
];

export function PackingView({ pkg, size = 260 }: { pkg: PackageInfo; size?: number }) {
  const { length: L, width: W, height: H } = pkg.box;
  const corners = [
    [0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0], [0, 0, H], [L, 0, H], [L, W, H], [0, W, H],
  ].map(([x, y, z]) => iso({ x, y, z }));
  const us = corners.map((c) => c.u), vs = corners.map((c) => c.v);
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
  const pad = 14;
  const scale = (size - 2 * pad) / Math.max(maxU - minU, maxV - minV);
  const P = (x: number, y: number, z: number) => {
    const p = iso({ x, y, z });
    return { x: pad + (p.u - minU) * scale, y: pad + (p.v - minV) * scale };
  };
  const pts = (arr: { x: number; y: number }[]) => arr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const h = (maxV - minV) * scale + 2 * pad;
  const w = (maxU - minU) * scale + 2 * pad;
  const edge = (a: number[], b: number[], dashed = false, k = '') => {
    const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]);
    return <Line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colors.ink} strokeWidth={dashed ? 1.5 : 3} strokeDasharray={dashed ? '5,4' : undefined} />;
  };
  // Orden de pintado: del fondo (x+y+z menor) al frente.
  const blocks = [...pkg.placements].sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z));

  return (
    <View style={{ alignItems: 'center' }} accessibilityLabel={`Caja ${L} por ${W} por ${H} centímetros con ${pkg.units} productos, ${pkg.fillPct}% llena`}>
      <Svg width={w} height={h}>
        {/* aristas traseras */}
        {edge([0, 0, 0], [0, W, 0], true, 'b1')}{edge([0, W, 0], [L, W, 0], true, 'b2')}{edge([0, W, 0], [0, W, H], true, 'b3')}
        {blocks.map((b, i) => {
          const c = PALETTE[i % PALETTE.length];
          const x0 = b.x, y0 = b.y, z0 = b.z, x1 = b.x + b.l, y1 = b.y + b.w, z1 = b.z + b.h;
          return (
            <G key={i}>
              <Polygon points={pts([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])} fill={c.top} stroke={colors.ink} strokeWidth={1.5} />
              <Polygon points={pts([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)])} fill={c.left} stroke={colors.ink} strokeWidth={1.5} />
              <Polygon points={pts([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)])} fill={c.right} stroke={colors.ink} strokeWidth={1.5} />
            </G>
          );
        })}
        {/* aristas frontales de la caja */}
        {edge([0, 0, 0], [L, 0, 0], false, 'f1')}{edge([L, 0, 0], [L, W, 0], false, 'f2')}
        {edge([0, 0, 0], [0, 0, H], false, 'f3')}{edge([L, 0, 0], [L, 0, H], false, 'f4')}{edge([L, W, 0], [L, W, H], false, 'f5')}
        {edge([0, 0, H], [L, 0, H], false, 'f6')}{edge([L, 0, H], [L, W, H], false, 'f7')}{edge([L, W, H], [0, W, H], false, 'f8')}{edge([0, W, H], [0, 0, H], false, 'f9')}
        <SvgText x={P(L / 2, 0, 0).x} y={P(L / 2, 0, 0).y + 16} fontSize={12} fontWeight="bold" fill={colors.ink} textAnchor="middle">{L} cm</SvgText>
      </Svg>
    </View>
  );
}
