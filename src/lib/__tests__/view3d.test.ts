import { cameraPosition, makeProjector, offsetPolygon, shade, wallNormal } from '../view3d';
import { polygonArea } from '../geometry';

describe('RF-11 cámara y geometría 3D', () => {
  const cam = { azimuth: 0, tilt: 0.5, distance: 10, target: { x: 0, y: 0, z: 0 }, fovDeg: 45 };

  test('el objetivo se proyecta al centro de la pantalla', () => {
    const p = makeProjector(cam, 400, 300)({ x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(150);
    expect(p.depth).toBeCloseTo(10);
  });

  test('perspectiva: lo lejano se ve más pequeño', () => {
    const P = makeProjector({ ...cam, tilt: 0.0001 }, 400, 300);
    const near = P({ x: 1, y: 0, z: 2 }).x - 200;
    const far = P({ x: 1, y: 0, z: -2 }).x - 200;
    expect(near).toBeGreaterThan(far);
  });

  test('vista cenital (tilt ≈ 90°) no degenera', () => {
    const p = makeProjector({ ...cam, tilt: Math.PI / 2 }, 400, 300)({ x: 1, y: 0, z: 0 });
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(cameraPosition({ ...cam, tilt: Math.PI / 2 }).y).toBeCloseTo(10);
  });

  test('grosor de pared: el contorno exterior crece t en cada lado (ambas orientaciones)', () => {
    const sq = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
    expect(polygonArea(offsetPolygon(sq, 0.1))).toBeCloseTo(4.2 * 3.2, 6);
    expect(polygonArea(offsetPolygon([...sq].reverse(), 0.1))).toBeCloseTo(4.2 * 3.2, 6);
  });

  test('normal exterior de la pared y sombreado', () => {
    const sq = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
    const n0 = wallNormal(sq, 0); // pared en z = 0 → apunta a -z
    expect(n0.z).toBeCloseTo(-1);
    const sh = shade({ x: 0, y: 1, z: 0 });
    expect(sh).toBeGreaterThan(0.45);
    expect(sh).toBeLessThanOrEqual(1);
  });
});
