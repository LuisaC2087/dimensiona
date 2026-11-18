/** RF-08: plano en planta con paredes numeradas, cotas, área y barra de escala. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Polygon, Text as SvgText, Circle, Rect } from 'react-native-svg';
import { formatArea, formatLength, type Point2, type Unit } from '../lib';
import { colors } from '../theme';

interface Props { corners: Point2[]; walls: number[]; areaM2: number; unit: Unit; decimals: number; height?: number }

const PAD = 48;

function niceScale(maxM: number): number {
  const steps = [0.5, 1, 2, 5, 10];
  return steps.find((s) => s >= maxM / 4) ?? 10;
}

export function Plan2D({ corners, walls, areaM2, unit, decimals, height = 340 }: Props) {
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const gesture = useRef({ startDist: 0, startZoom: 1, startPan: { x: 0, y: 0 } });

  const geo = useMemo(() => {
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const spanX = Math.max(maxX - minX, 0.01), spanZ = Math.max(maxZ - minZ, 0.01);
    const scale = width > 0 ? Math.min((width - 2 * PAD) / spanX, (height - 2 * PAD) / spanZ) : 1;
    const offX = (width - spanX * scale) / 2, offY = (height - spanZ * scale) / 2;
    const pts = corners.map((c) => ({ x: offX + (c.x - minX) * scale, y: offY + (c.z - minZ) * scale }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { pts, scale, cx, cy, barM: niceScale(Math.max(spanX, spanZ)) };
  }, [corners, width, height]);

  // Valores vigentes de zoom y desplazamiento para el gesto (sin recrear el PanResponder).
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  useEffect(() => { view.current = { zoom, pan }; }, [zoom, pan]);

  // Los manejadores del gesto se ejecutan fuera del render; el compilador no lo distingue.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      gesture.current.startZoom = view.current.zoom;
      gesture.current.startPan = view.current.pan;
      gesture.current.startDist = t.length === 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
    },
    onPanResponderMove: (e, g) => {
      const t = e.nativeEvent.touches;
      if (t.length === 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!gesture.current.startDist) gesture.current.startDist = d;
        setZoom(Math.min(4, Math.max(0.5, gesture.current.startZoom * (d / gesture.current.startDist))));
      } else {
        setPan({ x: gesture.current.startPan.x + g.dx, y: gesture.current.startPan.y + g.dy });
      }
    },
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const { pts, scale, cx, cy, barM } = geo;
  const n = pts.length;

  return (
    <View onLayout={onLayout} style={{ height, backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' }} {...responder.panHandlers}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <G transform={`translate(${pan.x + (width / 2) * (1 - zoom)} ${pan.y + (height / 2) * (1 - zoom)}) scale(${zoom})`}>
            <Polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(255,209,0,0.12)" stroke={colors.accent} strokeWidth={3 / zoom} />
            {pts.map((p, i) => {
              const q = pts[(i + 1) % n];
              const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
              // desplaza la cota hacia afuera del centroide
              const dx = mx - cx, dy = my - cy, len = Math.hypot(dx, dy) || 1;
              const lx = mx + (dx / len) * 18, ly = my + (dy / len) * 18;
              return (
                <G key={i}>
                  <SvgText x={lx} y={ly + 5} fill={colors.text} fontSize={13 / zoom} fontWeight="600" textAnchor="middle">
                    {`P${i + 1} · ${formatLength(walls[i], unit, decimals)}`}
                  </SvgText>
                  <Circle cx={p.x} cy={p.y} r={9 / zoom} fill={colors.accent} />
                  <SvgText x={p.x} y={p.y + 4 / zoom} fill={colors.onAccent} fontSize={11 / zoom} fontWeight="700" textAnchor="middle">{String(i + 1)}</SvgText>
                </G>
              );
            })}
            <SvgText x={cx} y={cy + 6} fill={colors.accent} fontSize={18 / zoom} fontWeight="700" textAnchor="middle">{formatArea(areaM2, decimals)}</SvgText>
          </G>
          {/* barra de escala fija (no se escala con el zoom, se ajusta su longitud) */}
          <Rect x={16} y={height - 24} width={barM * scale * zoom} height={6} fill={colors.text} />
          <SvgText x={16} y={height - 30} fill={colors.text} fontSize={12}>{formatLength(barM, unit, 1)}</SvgText>
        </Svg>
      )}
    </View>
  );
}
