/**
 * RF-11: modelo 3D estilo mapa (perspectiva, paredes con grosor y sombreado, piso con cuadrícula).
 * Un dedo: girar (horizontal) e inclinar (vertical). Dos dedos: acercar/alejar.
 * Las paredes que tapan la vista se vuelven translúcidas para ver el interior.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import {
  formatArea, formatLength, makeProjector, mixColor, offsetPolygon, polygonArea, shade, wallLengths, wallNormal,
  type Camera, type Point2, type Unit, type V3,
} from '../lib';
import { colors, space } from '../theme';
import { Button, s } from './ui';

interface Props { corners: Point2[]; heightM: number; unit: Unit; decimals: number; size?: number }

const WALL_T = 0.12; // grosor visual de pared (m)
const WALL_COLOR = '#E8E4DA';
const TOP_COLOR = '#FFD100';
const FLOOR_COLOR = '#3A3A40';

type Face = { pts: { x: number; y: number }[]; depth: number; fill: string; opacity: number; stroke?: string };

export function Model3D({ corners, heightM, unit, decimals, size = 380 }: Props) {
  const [width, setWidth] = useState(0);
  const span = useMemo(() => {
    const xs = corners.map((c) => c.x), zs = corners.map((c) => c.z);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), heightM);
  }, [corners, heightM]);
  const initial = useMemo(() => ({ azimuth: Math.PI / 5, tilt: 0.75, distance: span * 1.9 }), [span]);
  const [cam, setCam] = useState(initial);
  const g = useRef({ cam: initial, dist: 0 });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      g.current = { cam, dist: t.length === 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0 };
    },
    onPanResponderMove: (e, gs) => {
      const t = e.nativeEvent.touches;
      if (t.length === 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!g.current.dist) g.current.dist = d;
        const distance = Math.min(span * 5, Math.max(span * 0.6, g.current.cam.distance * (g.current.dist / d)));
        setCam((c) => ({ ...c, distance }));
      } else {
        setCam((c) => ({
          ...c,
          azimuth: g.current.cam.azimuth - gs.dx * 0.008,
          tilt: Math.min(1.55, Math.max(0.15, g.current.cam.tilt + gs.dy * 0.006)),
        }));
      }
    },
  }), [cam, span]);

  const scene = useMemo(() => {
    if (!width) return null;
    const cx = corners.reduce((a, c) => a + c.x, 0) / corners.length;
    const cz = corners.reduce((a, c) => a + c.z, 0) / corners.length;
    const inner = corners.map((c) => ({ x: c.x - cx, z: c.z - cz }));
    const outer = offsetPolygon(inner, WALL_T);
    const camera: Camera = { ...cam, target: { x: 0, y: heightM * 0.35, z: 0 }, fovDeg: 45 };
    const P = makeProjector(camera, width, size);
    const eye = { x: Math.sin(cam.azimuth), z: Math.cos(cam.azimuth) }; // dirección hacia la cámara (planta)
    const at = (p: Point2, y: number): V3 => ({ x: p.x, y, z: p.z });
    const faces: Face[] = [];
    const n = inner.length;

    // Piso
    const floorP = inner.map((p) => P(at(p, 0)));
    faces.push({ pts: floorP, depth: Infinity, fill: FLOOR_COLOR, opacity: 1 });

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const nrm = wallNormal(inner, i);
      const facingCamera = nrm.x * eye.x + nrm.z * eye.z > 0.15 && cam.tilt < 1.2;
      const opacity = facingCamera ? 0.18 : 1; // corte: la pared que tapa se vuelve translúcida
      const quad = (a: V3, b: V3, c: V3, d: V3, normal: V3, base: string) => {
        const pts = [a, b, c, d].map(P);
        faces.push({ pts, depth: pts.reduce((s2, p) => s2 + p.depth, 0) / 4, fill: mixColor(base, shade(normal)), opacity, stroke: 'rgba(0,0,0,0.25)' });
      };
      const inNrm = { x: -nrm.x, y: 0, z: -nrm.z };
      quad(at(inner[i], 0), at(inner[j], 0), at(inner[j], heightM), at(inner[i], heightM), inNrm, WALL_COLOR); // cara interior
      quad(at(outer[i], 0), at(outer[j], 0), at(outer[j], heightM), at(outer[i], heightM), nrm, WALL_COLOR); // cara exterior
      quad(at(inner[i], heightM), at(inner[j], heightM), at(outer[j], heightM), at(outer[i], heightM), { x: 0, y: 1, z: 0 }, TOP_COLOR); // remate
    }
    faces.sort((a, b) => b.depth - a.depth);

    // Cuadrícula del piso (50 cm), recortada al rectángulo envolvente
    const xs = inner.map((p) => p.x), zs = inner.map((p) => p.z);
    const grid: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
    const step = 0.5;
    for (let x = Math.ceil(Math.min(...xs) / step) * step; x <= Math.max(...xs); x += step) {
      grid.push({ a: P({ x, y: 0.001, z: Math.min(...zs) }), b: P({ x, y: 0.001, z: Math.max(...zs) }) });
    }
    for (let z = Math.ceil(Math.min(...zs) / step) * step; z <= Math.max(...zs); z += step) {
      grid.push({ a: P({ x: Math.min(...xs), y: 0.001, z }), b: P({ x: Math.max(...xs), y: 0.001, z }) });
    }

    // Etiquetas: medida de cada pared (a ras del piso, por dentro), área y altura
    const walls = wallLengths(inner);
    const labels = inner.map((p, i) => {
      const q = inner[(i + 1) % n];
      const nrm = wallNormal(inner, i);
      return { p: P({ x: (p.x + q.x) / 2 - nrm.x * 0.35, y: 0.02, z: (p.z + q.z) / 2 - nrm.z * 0.35 }), text: formatLength(walls[i], unit, decimals) };
    });
    // Altura en la esquina más cercana a la cámara
    let k = 0;
    for (let i = 1; i < n; i++) if (P(at(outer[i], 0)).depth < P(at(outer[k], 0)).depth) k = i;
    const hA = P(at(outer[k], 0)), hB = P(at(outer[k], heightM));
    return { faces, grid, labels, center: P({ x: 0, y: 0.02, z: 0 }), hA, hB, area: polygonArea(corners) };
  }, [corners, heightM, cam, width, size, unit, decimals]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pts = (f: Face) => f.pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={{ gap: space.sm }}>
      <View onLayout={onLayout} style={{ height: size, borderRadius: 14, overflow: 'hidden', backgroundColor: '#15161A' }} {...responder.panHandlers}>
        {scene && (
          <Svg width={width} height={size}>
            <Defs>
              <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#23252B" />
                <Stop offset="1" stopColor="#101114" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={size} fill="url(#sky)" />
            <G>
              {/* piso primero (está al fondo), luego cuadrícula, luego paredes de atrás hacia adelante */}
              {scene.faces.filter((f) => f.depth === Infinity).map((f, i) => (
                <Polygon key={`f${i}`} points={pts(f)} fill={f.fill} />
              ))}
              {scene.grid.map((l, i) => (
                <Line key={`g${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              ))}
              <SvgText x={scene.center.x} y={scene.center.y} fill={colors.accent} fontSize={16} fontWeight="800" textAnchor="middle">
                {formatArea(scene.area, decimals)}
              </SvgText>
              {scene.labels.map((l, i) => (
                <SvgText key={`l${i}`} x={l.p.x} y={l.p.y} fill="#FFFFFF" fontSize={12} fontWeight="700" textAnchor="middle">{l.text}</SvgText>
              ))}
              {scene.faces.filter((f) => f.depth !== Infinity).map((f, i) => (
                <Polygon key={`w${i}`} points={pts(f)} fill={f.fill} fillOpacity={f.opacity} stroke={f.stroke} strokeOpacity={f.opacity} strokeWidth={1} />
              ))}
              <Line x1={scene.hA.x} y1={scene.hA.y} x2={scene.hB.x} y2={scene.hB.y} stroke={colors.accent} strokeWidth={2} strokeDasharray="6,4" />
              <SvgText x={scene.hB.x + 8} y={(scene.hA.y + scene.hB.y) / 2} fill={colors.accent} fontSize={13} fontWeight="800">
                {`h ${formatLength(heightM, unit, decimals)}`}
              </SvgText>
            </G>
          </Svg>
        )}
      </View>
      <Text style={s.muted}>Un dedo: girar e inclinar · dos dedos: acercar</Text>
      <View style={s.row}>
        <Button label="Vista 3D" variant="secondary" style={{ flex: 1 }} onPress={() => setCam(initial)} />
        <Button label="Desde arriba" variant="secondary" style={{ flex: 1 }} onPress={() => setCam({ ...initial, azimuth: 0, tilt: 1.55 })} />
        <Button label="Norte" variant="secondary" onPress={() => setCam((c) => ({ ...c, azimuth: 0 }))} />
      </View>
    </View>
  );
}
