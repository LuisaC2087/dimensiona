/**
 * CR-04/CR-05: reconocimiento de objetos en el teléfono (sin internet) y medida precisa a pedido.
 * - El detector (YOLOE) entrega recuadros con etiqueta: todos se muestran con su nombre.
 * - Al tocar un objeto se selecciona y se mide: malla de 16 puntos 3D dentro del recuadro, descarte
 *   del fondo y mediana de las últimas lecturas (src/lib/boxMeasure.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import type { Detection, HitTestFn, ReticleHit } from '../ar/ARView';
import {
  gridPoints, measureFromGrid, pickScale, smoothMeasures,
  type GridMeasure, type GridSample, type Point3, type ScreenBox,
} from '../lib';

export interface Recognized extends Detection { selected: boolean }

const MEASURE_EVERY_MS = 400;
const UI_EVERY_MS = 120;
const HISTORY = 7; // lecturas para la mediana temporal
const MIN_READINGS = 3; // no se muestra una medida con menos lecturas

const center = (b: ScreenBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const contains = (b: ScreenBox, x: number, y: number) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

export function useObjectRecognition(opts: {
  enabled: boolean;
  hitTestRef: { current: HitTestFn | null };
  reticle: ReticleHit | null;
  screen: { w: number; h: number };
}) {
  const { enabled, hitTestRef, reticle, screen } = opts;
  const [items, setItems] = useState<Recognized[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [measure, setMeasure] = useState<GridMeasure | null>(null);
  const [readings, setReadings] = useState(0);
  const latest = useRef<Detection[]>([]);
  const lastUi = useRef(0);
  const scale = useRef<number | null>(null); // dp → unidades que espera el hit test
  const sel = useRef<{ label: string; at: { x: number; y: number } } | null>(null);
  const history = useRef<GridMeasure[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const reticleRef = useRef(reticle);
  useEffect(() => { reticleRef.current = reticle; }, [reticle]);

  /** Sigue al objeto seleccionado entre cuadros: misma etiqueta y el recuadro más cercano al anterior. */
  const trackSelected = useCallback((dets: Detection[]): number => {
    const s = sel.current;
    if (!s) return -1;
    let best = -1, bestD = Infinity;
    dets.forEach((d, i) => {
      if (d.label !== s.label) return;
      const c = center(d.box);
      const dist = Math.hypot(c.x - s.at.x, c.y - s.at.y);
      if (dist < bestD) { bestD = dist; best = i; }
    });
    if (best >= 0 && bestD < Math.max(screen.w, 1) * 0.35) { s.at = center(dets[best].box); return best; }
    return -1;
  }, [screen.w]);

  const publish = useCallback((dets: Detection[]) => {
    const i = trackSelected(dets);
    setItems(dets.map((d, k) => ({ ...d, selected: k === i })));
  }, [trackSelected]);

  const onDetections = useCallback((dets: Detection[]) => {
    latest.current = dets;
    const t = Date.now();
    if (t - lastUi.current < UI_EVERY_MS) return;
    lastUi.current = t;
    publish(dets);
  }, [publish]);

  const clear = useCallback(() => {
    sel.current = null; setHasSelection(false); history.current = []; setMeasure(null); setReadings(0); publish(latest.current);
  }, [publish]);

  /** Toque en pantalla: selecciona el objeto más pequeño que contiene el punto. Devuelve si acertó. */
  const selectAt = useCallback((x: number, y: number): boolean => {
    const hit = latest.current.filter((d) => contains(d.box, x, y))
      .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];
    history.current = []; setMeasure(null); setReadings(0);
    sel.current = hit ? { label: hit.label, at: center(hit.box) } : null;
    setHasSelection(!!hit);
    publish(latest.current);
    return !!hit;
  }, [publish]);

  // Calibra la escala de coordenadas una vez, comparando el centro de pantalla con la retícula.
  useEffect(() => {
    if (!enabled || scale.current != null || !reticle || !screen.w) return;
    const hit = hitTestRef.current;
    if (!hit) return;
    const cx = screen.w / 2, cy = screen.h / 2, pr = PixelRatio.get();
    Promise.all([1, pr].map(async (s) => ({ scale: s, hit: await hit(cx * s, cy * s) })))
      .then((c) => {
        scale.current = pickScale(c, reticle.position) ?? scale.current;
        setCalibrated(scale.current != null);
      })
      .catch(() => undefined);
  }, [enabled, reticle, screen, hitTestRef]);

  // Mide el objeto seleccionado: una lectura cada 400 ms, mediana de las últimas 7.
  useEffect(() => {
    if (!enabled) return;
    let alive = true, busy = false;
    const timer = setInterval(async () => {
      const hit = hitTestRef.current, s = scale.current, cam = reticleRef.current?.cameraPosition;
      if (busy || !hit || s == null || !cam || !sel.current) return;
      const d = latest.current[trackSelected(latest.current)];
      if (!d || d.box.width < 12 || d.box.height < 12) return;
      busy = true;
      try {
        const pts = gridPoints(d.box);
        const hits = await Promise.all(pts.map((p) => hit(p.x * s, p.y * s)));
        if (!alive) return;
        const samples: GridSample[] = [];
        hits.forEach((p: Point3 | null, i) => { if (p) samples.push({ sx: pts[i].x, sy: pts[i].y, p }); });
        const m = measureFromGrid(samples, d.box, cam);
        if (!m) return;
        history.current = [...history.current.slice(-(HISTORY - 1)), m];
        setReadings(history.current.length);
        if (history.current.length >= MIN_READINGS) setMeasure(smoothMeasures(history.current));
      } finally { busy = false; }
    }, MEASURE_EVERY_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [enabled, hitTestRef, trackSelected]);

  /** Punto 3D bajo un punto de la pantalla (dp), con la escala ya calibrada. */
  const probe = useCallback(async (x: number, y: number): Promise<Point3 | null> => {
    const s = scale.current ?? PixelRatio.get();
    return (await hitTestRef.current?.(x * s, y * s)) ?? null;
  }, [hitTestRef]);

  const visible = enabled ? items : [];
  const selected = visible.find((d) => d.selected) ?? null;
  return {
    items: visible, selected, measure: selected ? measure : null, readings, error,
    hasSelection, calibrated,
    onDetections, onError: setError, selectAt, clear, probe,
  };
}
