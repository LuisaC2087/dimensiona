/** Repositorio de proyectos (RF-10). Toda escritura es transaccional (RNF-09). */
import type { SQLiteDatabase } from 'expo-sqlite';
import { levelFor, polygonArea, type Point2, type Point3, type ReliabilityLevel, type Unit } from '../lib';
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

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_SQL);
}

type ProjectRow = {
  id: string; nombre: string; tipo_espacio: SpaceType; altura_m: number | null; altura_conf: number | null;
  factor_k: number; es_demo: number; creado: string; modificado: string;
};

const toProject = (r: ProjectRow): Project => ({
  id: r.id, name: r.nombre, spaceType: r.tipo_espacio, heightM: r.altura_m, heightConf: r.altura_conf,
  k: r.factor_k, isDemo: !!r.es_demo, created: r.creado, modified: r.modificado,
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

export async function createProject(db: SQLiteDatabase, name: string, spaceType: SpaceType, isDemo = false): Promise<Project> {
  const id = newId();
  const t = now();
  const finalName = await uniqueName(db, name);
  await db.runAsync(
    'INSERT INTO proyecto (id, nombre, tipo_espacio, factor_k, es_demo, creado, modificado) VALUES (?, ?, ?, 1.0, ?, ?, ?)',
    id, finalName, spaceType, isDemo ? 1 : 0, t, t,
  );
  return { id, name: finalName, spaceType, heightM: null, heightConf: null, k: 1, isDemo, created: t, modified: t };
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
    FROM proyecto p ORDER BY p.modificado DESC`);
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

async function touch(db: SQLiteDatabase, id: string) {
  await db.runAsync('UPDATE proyecto SET modificado = ? WHERE id = ?', now(), id);
}

export async function renameProject(db: SQLiteDatabase, id: string, name: string): Promise<string> {
  const finalName = await uniqueName(db, name, id);
  await db.runAsync('UPDATE proyecto SET nombre = ?, modificado = ? WHERE id = ?', finalName, now(), id);
  return finalName;
}

/** Devuelve las rutas de fotos para que el llamador borre los archivos (RNF-10). */
export async function deleteProject(db: SQLiteDatabase, id: string): Promise<string[]> {
  const photos = await db.getAllAsync<{ ruta: string }>('SELECT ruta FROM foto WHERE proyecto_id = ?', id);
  await db.runAsync('DELETE FROM proyecto WHERE id = ?', id);
  return photos.map((p) => p.ruta);
}

export async function getCorners(db: SQLiteDatabase, projectId: string): Promise<Corner[]> {
  const rows = await db.getAllAsync<{ orden: number; x: number; z: number; confiabilidad: number }>(
    'SELECT orden, x, z, confiabilidad FROM esquina WHERE proyecto_id = ? ORDER BY orden', projectId);
  return rows.map((r) => ({ order: r.orden, x: r.x, z: r.z, confidence: r.confiabilidad }));
}

/** Reemplaza el contorno completo de forma atómica. */
export async function saveCorners(db: SQLiteDatabase, projectId: string, corners: Omit<Corner, 'order'>[]): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM esquina WHERE proyecto_id = ?', projectId);
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      await tx.runAsync('INSERT INTO esquina (id, proyecto_id, orden, x, z, confiabilidad) VALUES (?, ?, ?, ?, ?, ?)',
        newId(), projectId, i, c.x, c.z, c.confidence);
    }
    await tx.runAsync('UPDATE proyecto SET modificado = ? WHERE id = ?', now(), projectId);
  });
}

export async function setHeight(db: SQLiteDatabase, projectId: string, h: number | null, confidence: number | null) {
  await db.runAsync('UPDATE proyecto SET altura_m = ?, altura_conf = ?, modificado = ? WHERE id = ?', h, confidence, now(), projectId);
}

export async function setCalibration(db: SQLiteDatabase, projectId: string, k: number) {
  await db.runAsync('UPDATE proyecto SET factor_k = ?, modificado = ? WHERE id = ?', k, now(), projectId);
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
      `INSERT INTO medicion (id, proyecto_id, tipo, valor_m, a_x, a_y, a_z, b_x, b_y, b_z, confiabilidad, nivel, factores, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      full.id, projectId, full.kind, full.valueM,
      full.a?.x ?? null, full.a?.y ?? null, full.a?.z ?? null, full.b?.x ?? null, full.b?.y ?? null, full.b?.z ?? null,
      full.confidence, full.level, JSON.stringify(full.factors), full.created);
    await tx.runAsync('UPDATE proyecto SET modificado = ? WHERE id = ?', full.created, projectId);
  });
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
  await db.runAsync('DELETE FROM medicion WHERE id = ?', id);
  await touch(db, projectId);
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
