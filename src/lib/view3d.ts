/**
 * RF-11: geometría y cámara del modelo 3D (funciones puras, sin dibujo).
 * Cámara orbital en perspectiva (como un mapa 3D): acimut, inclinación y distancia alrededor de un objetivo.
 */
import type { Point2 } from './types';

export interface V3 { x: number; y: number; z: number }
export interface Camera { azimuth: number; tilt: number; distance: number; target: V3; fovDeg: number }
export interface Projected { x: number; y: number; depth: number; visible: boolean }

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

export function cameraPosition(c: Camera): V3 {
  return {
    x: c.target.x + c.distance * Math.cos(c.tilt) * Math.sin(c.azimuth),
    y: c.target.y + c.distance * Math.sin(c.tilt),
    z: c.target.z + c.distance * Math.cos(c.tilt) * Math.cos(c.azimuth),
  };
}

/** Devuelve una función que proyecta puntos del mundo a pantalla (px), con profundidad para ordenar caras. */
export function makeProjector(c: Camera, width: number, height: number) {
  const eye = cameraPosition(c);
  const f = normalize(sub(c.target, eye));
  const worldUp = Math.abs(f.y) > 0.999 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const r = normalize(cross(f, worldUp));
  const u = cross(r, f);
  const focal = (height / 2) / Math.tan((c.fovDeg * Math.PI) / 360);
  return (p: V3): Projected => {
    const d = sub(p, eye);
    const zc = dot(d, f);
    const visible = zc > 0.05;
    const z = Math.max(zc, 0.05);
    return { x: width / 2 + (dot(d, r) * focal) / z, y: height / 2 - (dot(d, u) * focal) / z, depth: zc, visible };
  };
}

/** Desplaza el contorno hacia afuera `t` metros (inglete), para dar grosor a las paredes. */
export function offsetPolygon(poly: Point2[], t: number): Point2[] {
  const n = poly.length;
  const area2 = poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % n].z - poly[(i + 1) % n].x * p.z, 0);
  const sign = area2 > 0 ? 1 : -1; // normal exterior según la orientación
  const normals = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    return { x: (sign * dz) / l, z: (-sign * dx) / l };
  });
  return poly.map((p, i) => {
    const a = normals[(i - 1 + n) % n], b = normals[i];
    const m = { x: a.x + b.x, z: a.z + b.z };
    const ml = Math.hypot(m.x, m.z) || 1;
    const cos = (m.x * b.x + m.z * b.z) / ml;
    const k = t / Math.max(cos, 0.3); // limita el inglete en ángulos muy agudos
    return { x: p.x + (m.x / ml) * k, z: p.z + (m.z / ml) * k };
  });
}

/** Normal exterior (horizontal) de la pared i. */
export function wallNormal(poly: Point2[], i: number): V3 {
  const n = poly.length;
  const area2 = poly.reduce((s, p, k) => s + p.x * poly[(k + 1) % n].z - poly[(k + 1) % n].x * p.z, 0);
  const sign = area2 > 0 ? 1 : -1;
  const p = poly[i], q = poly[(i + 1) % n];
  const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
  return { x: (sign * dz) / l, y: 0, z: (-sign * dx) / l };
}

/** Sombreado difuso tipo mapa: luz fija desde arriba-noroeste + luz ambiente. Devuelve 0..1. */
export function shade(normal: V3, light: V3 = normalize({ x: -0.5, y: 0.8, z: -0.35 }), ambient = 0.45): number {
  return Math.min(1, ambient + (1 - ambient) * Math.max(0, dot(normalize(normal), light)));
}

export function mixColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
