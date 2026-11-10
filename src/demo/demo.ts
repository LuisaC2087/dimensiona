/** RF-16: proyecto de ejemplo, sala de 4,20 × 3,60 × 2,50 m marcada como «Demo». */
import type { SQLiteDatabase } from 'expo-sqlite';
import { addMeasurement, createProject, saveCorners, setHeight } from '../db/repo';

export const DEMO_NAME = 'Sala (Demo)';

const CORNERS = [
  { x: 0, z: 0, confidence: 88 },
  { x: 4.2, z: 0, confidence: 84 },
  { x: 4.2, z: 3.6, confidence: 79 },
  { x: 0, z: 3.6, confidence: 86 },
];

/** Devuelve el id del demo, recreándolo si falta o está dañado. */
export async function ensureDemo(db: SQLiteDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ id: string; n: number }>(
    `SELECT p.id, (SELECT COUNT(*) FROM esquina e WHERE e.proyecto_id = p.id) AS n
     FROM proyecto p WHERE p.es_demo = 1 LIMIT 1`);
  if (row && row.n === CORNERS.length) return row.id;
  if (row) await db.runAsync('DELETE FROM proyecto WHERE id = ?', row.id);

  const p = await createProject(db, DEMO_NAME, 'sala', true);
  await saveCorners(db, p.id, CORNERS);
  await setHeight(db, p.id, 2.5, 81);
  await addMeasurement(db, p.id, {
    kind: 'distancia', valueM: 1.82,
    a: { x: 0.5, y: 0, z: 0.4 }, b: { x: 2.32, y: 0, z: 0.4 },
    confidence: 86, factors: { T: 1, P: 1, D: 0.53 },
  });
  await addMeasurement(db, p.id, {
    kind: 'distancia', valueM: 0.94,
    a: { x: 3.9, y: 0.9, z: 3.6 }, b: { x: 3.9, y: 1.84, z: 3.6 },
    confidence: 46, factors: { T: 0.5, P: 0.5, D: 0.3 },
  });
  return p.id;
}
