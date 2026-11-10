/**
 * Repositorio local (RF-10). Toda escritura es transaccional (RNF-09), marca la fila como
 * pendiente de subir y avisa a la sincronización (RF-18). Los borrados se registran en «eliminado».
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { levelFor, polygonArea, type Point2, type Point3, type ReliabilityLevel, type Unit } from '../lib';
import { notifyLocalChange } from './changes';
import { SCHEMA_SQL } from './schema';

export const SPACE_TYPES = ['sala', 'cocina', 'dormitorio', 'oficina', 'otro'] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export interface Project {
  id: string;
  name: string;
  spaceType: SpaceType;
  heightM: number | null;
  heightConf: number | null;
  k: number;
  isDemo: boolean;
  created: string;
  modified: string;
  pending: boolean;
}

export interface ProjectSummary extends Project {
  areaM2: number | null;
  measurementCount: number;
  minConfidence: number | null;
}

export interface Corner extends Point2 { order: number; confidence: number }

export interface Measurement {
  id: string;
  kind: 'distancia' | 'altura' | 'referencia';
  valueM: number;
  a: Point3 | null;
  b: Point3 | null;
  confidence: number;
  level: ReliabilityLevel;
  factors: Record<string, number | boolean>;
  created: string;
}

export interface Settings { unit: Unit; decimals: number; tutorialSeen: boolean }

/** UUID v4 (compatible con Postgres). */
export function newId(): string {
  const h = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export const now = () => new Date().toISOString();

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_SQL);
}

type ProjectRow = {
  id: string; nombre: string; tipo_espacio: SpaceType; altura_m: number | null; altura_conf: number | null;
  factor_k: number; es_demo: number; creado: string; modificado: string; pendiente: number;
};

const toProject = (r: ProjectRow): Project => ({
  id: r.id, name: r.nombre, spaceType: r.tipo_espacio, heightM: r.altura_m, heightConf: r.altura_conf,
  k: r.factor_k, isDemo: !!r.es_demo, created: r.creado, modified: r.modificado, pending: !!r.pendiente,
});

/** Nombre libre: si existe, sugiere sufijo « (2)», « (3)»… */
export async function uniqueName(db: SQLiteDatabase, base: string, exceptId?: string): Promise<string> {
  const clean = base.trim() || 'Proyecto';
  let name = clean;
  for (let i = 2; ; i++) {
    const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM proyecto WHERE nombre = ?', name);
    if (!row || row.id === exceptId) return name;
    name = `${clean} (${i})`;
  }
}

/** Marca el proyecto como modificado y pendiente (tras cualquier cambio en él o sus hijos). */
async function touch(db: Pick<SQLiteDatabase, 'runAsync'>, id: string, t = now()) {
  await db.runAsync('UPDATE proyecto SET modificado = ?, pendiente = 1 WHERE id = ?', t, id);
}

export async function createProject(db: SQLiteDatabase, name: string, spaceType: SpaceType, isDemo = false): Promise<Project> {
  const id = newId();
  const t = now();
  const finalName = await uniqueName(db, name);
  await db.runAsync(
    'INSERT INTO proyecto (id, nombre, tipo_espacio, factor_k, es_demo, creado, modificado, pendiente) VALUES (?, ?, ?, 1.0, ?, ?, ?, ?)',
    id, finalName, spaceType, isDemo ? 1 : 0, t, t, isDemo ? 0 : 1,
  );
  if (!isDemo) notifyLocalChange();
  return { id, name: finalName, spaceType, heightM: null, heightConf: null, k: 1, isDemo, created: t, modified: t, pending: !isDemo };
}

export async function getProject(db: SQLiteDatabase, id: string): Promise<Project | null> {
  const r = await db.getFirstAsync<ProjectRow>('SELECT * FROM proyecto WHERE id = ?', id);
  return r ? toProject(r) : null;
}

export async function listProjects(db: SQLiteDatabase): Promise<ProjectSummary[]> {
  const rows = await db.getAllAsync<ProjectRow & { n: number; minconf: number | null }>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM medicion m WHERE m.proyecto_id = p.id) AS n,
      (SELECT MIN(c) FROM (
         SELECT confiabilidad AS c FROM medicion WHERE proyecto_id = p.id
         UNION ALL SELECT confiabilidad FROM esquina WHERE proyecto_id = p.id
         UNION ALL SELECT altura_conf FROM proyecto WHERE id = p.id AND altura_conf IS NOT NULL)) AS minconf
    FROM proyecto p ORDER BY p.es_demo DESC, p.modificado DESC`);
  const out: ProjectSummary[] = [];
  for (const r of rows) {
    const corners = await getCorners(db, r.id);
    out.push({
      ...toProject(r),
      areaM2: corners.length >= 3 ? polygonArea(corners) * r.factor_k ** 2 : null,
      measurementCount: r.n,
      minConfidence: r.minconf,
    });
  }
  return out;
}

export async function renameProject(db: SQLiteDatabase, id: string, name: string): Promise<string> {
  const finalName = await uniqueName(db, name, id);
  await db.runAsync('UPDATE proyecto SET nombre = ?, modificado = ?, pendiente = 1 WHERE id = ?', finalName, now(), id);
  notifyLocalChange();
  return finalName;
}

/** Devuelve las rutas de fotos para que el llamador borre los archivos (RNF-10). */
export async function deleteProject(db: SQLiteDatabase, id: string): Promise<string[]> {
  const photos = await db.getAllAsync<{ ruta: string }>('SELECT ruta FROM foto WHERE proyecto_id = ?', id);
  const p = await db.getFirstAsync<{ es_demo: number }>('SELECT es_demo FROM proyecto WHERE id = ?', id);
  await db.withExclusiveTransactionAsync(async (tx) => {
    if (p && !p.es_demo) {
      await tx.runAsync('INSERT OR REPLACE INTO eliminado (tabla, id, fecha) VALUES (?, ?, ?)', 'proyecto', id, now());
    }
    await tx.runAsync('DELETE FROM proyecto WHERE id = ?', id);
  });
  notifyLocalChange();
  return photos.map((x) => x.ruta);
}

export async function getCorners(db: SQLiteDatabase, projectId: string): Promise<Corner[]> {
  const rows = await db.getAllAsync<{ orden: number; x: number; z: number; confiabilidad: number }>(
    'SELECT orden, x, z, confiabilidad FROM esquina WHERE proyecto_id = ? ORDER BY orden', projectId);
  return rows.map((r) => ({ order: r.orden, x: r.x, z: r.z, confidence: r.confiabilidad }));
}

/** Reemplaza el contorno completo de forma atómica. Ids estables por (proyecto, orden) para sincronizar. */
export async function saveCorners(db: SQLiteDatabase, projectId: string, corners: Omit<Corner, 'order'>[]): Promise<void> {
  const t = now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const old = await tx.getAllAsync<{ id: string; orden: number }>('SELECT id, orden FROM esquina WHERE proyecto_id = ?', projectId);
    for (const o of old) {
      if (o.orden >= corners.length) {
        await tx.runAsync('INSERT OR REPLACE INTO eliminado (tabla, id, fecha) VALUES (?, ?, ?)', 'esquina', o.id, t);
        await tx.runAsync('DELETE FROM esquina WHERE id = ?', o.id);
      }
    }
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      const existing = old.find((o) => o.orden === i);
      await tx.runAsync(
        `INSERT INTO esquina (id, proyecto_id, orden, x, z, confiabilidad, modificado, pendiente) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET x = excluded.x, z = excluded.z, confiabilidad = excluded.confiabilidad,
           modificado = excluded.modificado, pendiente = 1`,
        existing?.id ?? newId(), projectId, i, c.x, c.z, c.confidence, t);
    }
    await touch(tx, projectId, t);
  });
  notifyLocalChange();
}

export async function setHeight(db: SQLiteDatabase, projectId: string, h: number | null, confidence: number | null) {
  await db.runAsync('UPDATE proyecto SET altura_m = ?, altura_conf = ?, modificado = ?, pendiente = 1 WHERE id = ?', h, confidence, now(), projectId);
  notifyLocalChange();
}

export async function setCalibration(db: SQLiteDatabase, projectId: string, k: number) {
  await db.runAsync('UPDATE proyecto SET factor_k = ?, modificado = ?, pendiente = 1 WHERE id = ?', k, now(), projectId);
  notifyLocalChange();
}

type MeasurementRow = {
  id: string; tipo: Measurement['kind']; valor_m: number;
  a_x: number | null; a_y: number | null; a_z: number | null; b_x: number | null; b_y: number | null; b_z: number | null;
  confiabilidad: number; nivel: ReliabilityLevel; factores: string; creado: string;
};

export async function addMeasurement(db: SQLiteDatabase, projectId: string, m: Omit<Measurement, 'id' | 'created' | 'level'>): Promise<Measurement> {
  const full: Measurement = { ...m, id: newId(), created: now(), level: levelFor(m.confidence) };
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO medicion (id, proyecto_id, tipo, valor_m, a_x, a_y, a_z, b_x, b_y, b_z, confiabilidad, nivel, factores, creado, modificado, pendiente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      full.id, projectId, full.kind, full.valueM,
      full.a?.x ?? null, full.a?.y ?? null, full.a?.z ?? null, full.b?.x ?? null, full.b?.y ?? null, full.b?.z ?? null,
      full.confidence, full.level, JSON.stringify(full.factors), full.created, full.created);
    await touch(tx, projectId, full.created);
  });
  notifyLocalChange();
  return full;
}

export async function listMeasurements(db: SQLiteDatabase, projectId: string): Promise<Measurement[]> {
  const rows = await db.getAllAsync<MeasurementRow>('SELECT * FROM medicion WHERE proyecto_id = ? ORDER BY creado', projectId);
  return rows.map((r) => ({
    id: r.id, kind: r.tipo, valueM: r.valor_m,
    a: r.a_x == null ? null : { x: r.a_x, y: r.a_y!, z: r.a_z! },
    b: r.b_x == null ? null : { x: r.b_x, y: r.b_y!, z: r.b_z! },
    confidence: r.confiabilidad, level: r.nivel, factors: JSON.parse(r.factores), created: r.creado,
  }));
}

export async function deleteMeasurement(db: SQLiteDatabase, projectId: string, id: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('INSERT OR REPLACE INTO eliminado (tabla, id, fecha) VALUES (?, ?, ?)', 'medicion', id, now());
    await tx.runAsync('DELETE FROM medicion WHERE id = ?', id);
    await touch(tx, projectId);
  });
  notifyLocalChange();
}

export async function countPending(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(`
    SELECT (SELECT COUNT(*) FROM proyecto WHERE pendiente = 1 AND es_demo = 0)
         + (SELECT COUNT(*) FROM esquina WHERE pendiente = 1 AND proyecto_id IN (SELECT id FROM proyecto WHERE es_demo = 0))
         + (SELECT COUNT(*) FROM medicion WHERE pendiente = 1 AND proyecto_id IN (SELECT id FROM proyecto WHERE es_demo = 0))
         + (SELECT COUNT(*) FROM nota WHERE pendiente = 1 AND proyecto_id IN (SELECT id FROM proyecto WHERE es_demo = 0))
         + (SELECT COUNT(*) FROM eliminado) AS n`);
  return r?.n ?? 0;
}

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const r = await db.getFirstAsync<{ unidad: Unit; decimales: number; tutorial_visto: number }>('SELECT * FROM ajustes WHERE id = 1');
  return { unit: r?.unidad ?? 'm', decimals: r?.decimales ?? 2, tutorialSeen: !!r?.tutorial_visto };
}

export async function saveSettings(db: SQLiteDatabase, s: Partial<Settings>) {
  const cur = await getSettings(db);
  const next = { ...cur, ...s };
  await db.runAsync('UPDATE ajustes SET unidad = ?, decimales = ?, tutorial_visto = ? WHERE id = 1', next.unit, next.decimals, next.tutorialSeen ? 1 : 0);
}
