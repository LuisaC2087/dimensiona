/**
 * RF-11: modelo 3D simplificado (prisma extruido del contorno), dibujado con SVG.
 * Giro por arrastre, acercamiento por pellizco, vista isométrica o superior, cota de altura.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import { formatLength, type Point2, type Unit } from '../lib';
import { colors, space } from '../theme';
import { Button, s } from './ui';

interface Props { corners: Point2[]; heightM: number; unit: Unit; decimals: number; size?: number }

type V3 = { x: number; y: number; z: number };

const ISO = { yaw: Math.PI / 5, pitch: 0.55 };
const TOP = { yaw: 0, pitch: Math.PI / 2 - 0.0001 };

export function project(p: V3, yaw: number, pitch: number) {
  const x1 = p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
  const z1 = p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  const y2 = p.y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = p.y * Math.sin(pitch) + z1 * Math.cos(pitch);
  return { x: x1, y: y2, depth: z2 };
}

export function Model3D({ corners, heightM, unit, decimals, size = 340 }: Props) {
  const [width, setWidth] = useState(0);
  const [view, setView] = useState(ISO);
  const [zoom, setZoom] = useState(1);
  const [ceiling, setCeiling] = useState(false);
  const g = useRef({ view: ISO, zoom: 1, dist: 0 });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      g.current = { view, zoom, dist: t.length === 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0 };
    },
    onPanResponderMove: (e, gs) => {
      const t = e.nativeEvent.touches;
      if (t.length === 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!g.current.dist) g.current.dist = d;
        setZoom(Math.min(3, Math.max(0.5, g.current.zoom * (d / g.current.dist))));
      } else {
        setView({
          yaw: g.current.view.yaw + gs.dx * 0.01,
          pitch: Math.min(Math.PI / 2 - 0.0001, Math.max(0.05, g.current.view.pitch + gs.dy * 0.01)),
        });
      }
    },
  }), [view, zoom]);

  const scene = useMemo(() => {
    const cx = corners.reduce((a, c) => a + c.x, 0) / corners.length;
    const cz = corners.reduce((a, c) => a + c.z, 0) / corners.length;
    const floor: V3[] = corners.map((c) => ({ x: c.x - cx, y: -heightM / 2, z: c.z - cz }));
    const top: V3[] = floor.map((p) => ({ ...p, y: heightM / 2 }));
    const P = (p: V3) => project(p, view.yaw, view.pitch);
    const pf = floor.map(P);
    const pt = top.map(P);
    const all = [...pf, ...pt];
    const span = Math.max(...all.map((p) => Math.abs(p.x)), ...all.map((p) => Math.abs(p.y)), 0.01);
    const scale = width > 0 ? ((Math.min(width, size) / 2 - 36) / span) * zoom : 1;
    const ox = width / 2;
    const oy = size / 2;
    const sc = (p: { x: number; y: number }) => `${ox + p.x * scale},${oy - p.y * scale}`;

    type Face = { pts: string; depth: number; kind: 'floor' | 'wall' | 'ceiling' };
    const n = corners.length;
    const faces: Face[] = [];
    faces.push({ pts: pf.map(sc).join(' '), depth: -Infinity, kind: 'floor' });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const q = [pf[i], pf[j], pt[j], pt[i]];
      faces.push({ pts: q.map(sc).join(' '), depth: q.reduce((a, p) => a + p.depth, 0) / 4, kind: 'wall' });
    }
    if (ceiling) faces.push({ pts: pt.map(sc).join(' '), depth: Infinity, kind: 'ceiling' });
    faces.sort((a, b) => a.depth - b.depth);

    // Cota de altura en la arista vertical más cercana al observador
    let k = 0;
    for (let i = 1; i < n; i++) if (pf[i].depth > pf[k].depth) k = i;
    const a = { x: ox + pf[k].x * scale, y: oy - pf[k].y * scale };
    const b = { x: ox + pt[k].x * scale, y: oy - pt[k].y * scale };
    return { faces, a, b };
  }, [corners, heightM, view, zoom, width, size, ceiling]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const fill = { floor: 'rgba(255,209,0,0.25)', wall: 'rgba(255,209,0,0.14)', ceiling: 'rgba(245,245,245,0.08)' };

  return (
    <View style={{ gap: space.sm }}>
      <View onLayout={onLayout} style={{ height: size, backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' }} {...responder.panHandlers}>
        {width > 0 && (
          <Svg width={width} height={size}>
            {scene.faces.map((f, i) => (
              <Polygon key={i} points={f.pts} fill={fill[f.kind]} stroke={colors.accent} strokeWidth={f.kind === 'wall' ? 1.5 : 2} />
            ))}
            <Line x1={scene.a.x} y1={scene.a.y} x2={scene.b.x} y2={scene.b.y} stroke={colors.text} strokeWidth={2} strokeDasharray="5,4" />
            <SvgText x={(scene.a.x + scene.b.x) / 2 + 8} y={(scene.a.y + scene.b.y) / 2} fill={colors.text} fontSize={14} fontWeight="700">
              {`h = ${formatLength(heightM, unit, decimals)}`}
            </SvgText>
          </Svg>
        )}
      </View>
      <Text style={s.muted}>Arrastra para girar · pellizca para acercar</Text>
      <View style={s.row}>
        <Button label="Isométrica" variant="secondary" style={{ flex: 1 }} onPress={() => { setView(ISO); setZoom(1); }} />
        <Button label="Superior" variant="secondary" style={{ flex: 1 }} onPress={() => { setView(TOP); setZoom(1); }} />
        <Button label={ceiling ? 'Sin techo' : 'Con techo'} variant="secondary" onPress={() => setCeiling(!ceiling)} />
      </View>
    </View>
  );
}
