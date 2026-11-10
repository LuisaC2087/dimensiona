/**
 * RF-18: sincronización bidireccional SQLite ⇄ Supabase.
 * 1) Subir: proyectos, esquinas y mediciones pendientes (no demo) y los borrados.
 * 2) Bajar: filas con sync_at > cursor, resueltas con resolveRemote (la nube es la base principal).
 * Las fotos no se suben (solo datos); sus notas sí (tabla nota).
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveRemote } from '../lib/syncRules';

const PAGE = 500;
type Table = 'proyecto' | 'esquina' | 'medicion' | 'nota';

const cursorKey = (userId: string) => `cursor:${userId}`;

async function getCursor(db: SQLiteDatabase, userId: string): Promise<string> {
  const r = await db.getFirstAsync<{ valor: string }>('SELECT valor FROM sync_meta WHERE clave = ?', cursorKey(userId));
  return r?.valor ?? '1970-01-01T00:00:00Z';
}

async function setCursor(db: SQLiteDatabase, userId: string, v: string) {
  await db.runAsync('INSERT OR REPLACE INTO sync_meta (clave, valor) VALUES (?, ?)', cursorKey(userId), v);
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

// ---------- subir ----------

async function push(db: SQLiteDatabase, sb: SupabaseClient, userId: string) {
  // Los proyectos creados sin sesión pasan a ser de esta cuenta.
  await db.runAsync('UPDATE proyecto SET usuario_id = ?, pendiente = 1 WHERE usuario_id IS NULL AND es_demo = 0', userId);

  const projects = await db.getAllAsync<any>('SELECT * FROM proyecto WHERE pendiente = 1 AND es_demo = 0 AND usuario_id = ?', userId);
  if (projects.length) {
    check(await sb.from('proyecto').upsert(projects.map((p) => ({
      id: p.id, nombre: p.nombre, tipo_espacio: p.tipo_espacio, altura_m: p.altura_m, altura_conf: p.altura_conf,
      factor_k: p.factor_k, creado: p.creado, modificado: p.modificado, borrado: false,
    }))));
    for (const p of projects) await db.runAsync('UPDATE proyecto SET pendiente = 0 WHERE id = ? AND modificado = ?', p.id, p.modificado);
  }

  const owned = 'proyecto_id IN (SELECT id FROM proyecto WHERE es_demo = 0 AND usuario_id = ?)';
  const corners = await db.getAllAsync<any>(`SELECT * FROM esquina WHERE pendiente = 1 AND ${owned}`, userId);
  if (corners.length) {
    check(await sb.from('esquina').upsert(corners.map((c) => ({
      id: c.id, proyecto_id: c.proyecto_id, orden: c.orden, x: c.x, z: c.z, confiabilidad: c.confiabilidad,
      modificado: c.modificado, borrado: false,
    }))));
    for (const c of corners) await db.runAsync('UPDATE esquina SET pendiente = 0 WHERE id = ? AND modificado = ?', c.id, c.modificado);
  }

  const meas = await db.getAllAsync<any>(`SELECT * FROM medicion WHERE pendiente = 1 AND ${owned}`, userId);
  if (meas.length) {
    check(await sb.from('medicion').upsert(meas.map((m) => ({
      id: m.id, proyecto_id: m.proyecto_id, tipo: m.tipo, valor_m: m.valor_m,
      a_x: m.a_x, a_y: m.a_y, a_z: m.a_z, b_x: m.b_x, b_y: m.b_y, b_z: m.b_z,
      confiabilidad: m.confiabilidad, nivel: m.nivel, factores: JSON.parse(m.factores),
      creado: m.creado, modificado: m.modificado, borrado: false,
    }))));
    for (const m of meas) await db.runAsync('UPDATE medicion SET pendiente = 0 WHERE id = ? AND modificado = ?', m.id, m.modificado);
  }

  const notes = await db.getAllAsync<any>(`SELECT * FROM nota WHERE pendiente = 1 AND ${owned}`, userId);
  if (notes.length) {
    check(await sb.from('nota').upsert(notes.map((n) => ({
      id: n.id, proyecto_id: n.proyecto_id, foto_id: n.foto_id, texto: n.texto,
      creado: n.creado, modificado: n.modificado, borrado: false,
    }))));
    for (const n of notes) await db.runAsync('UPDATE nota SET pendiente = 0 WHERE id = ? AND modificado = ?', n.id, n.modificado);
  }

  const dels = await db.getAllAsync<{ tabla: Table; id: string; fecha: string }>('SELECT * FROM eliminado');
  for (const t of ['nota', 'medicion', 'esquina', 'proyecto'] as Table[]) {
    const items = dels.filter((d) => d.tabla === t);
    if (!items.length) continue;
    const ids = items.map((d) => d.id);
    const fecha = items.reduce((m, d) => (d.fecha > m ? d.fecha : m), items[0].fecha);
    check(await sb.from(t).update({ borrado: true, modificado: fecha }).in('id', ids));
    if (t === 'proyecto') {
      check(await sb.from('esquina').update({ borrado: true, modificado: fecha }).in('proyecto_id', ids));
      check(await sb.from('medicion').update({ borrado: true, modificado: fecha }).in('proyecto_id', ids));
      check(await sb.from('nota').update({ borrado: true, modificado: fecha }).in('proyecto_id', ids));
    }
    for (const id of ids) await db.runAsync('DELETE FROM eliminado WHERE tabla = ? AND id = ?', t, id);
  }
}

// ---------- bajar ----------

async function fetchSince(sb: SupabaseClient, table: Table, since: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(await sb.from(table).select('*').gt('sync_at', since).order('sync_at').range(from, from + PAGE - 1)) as any[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function localState(db: SQLiteDatabase, table: Table, id: string) {
  const r = await db.getFirstAsync<{ modificado: string; pendiente: number }>(`SELECT modificado, pendiente FROM ${table} WHERE id = ?`, id);
  return r ? { modified: r.modificado, pending: !!r.pendiente } : null;
}

async function pull(db: SQLiteDatabase, sb: SupabaseClient, userId: string) {
  const since = await getCursor(db, userId);
  let maxSync = since;
  const track = (r: any) => { if (r.sync_at > maxSync) maxSync = r.sync_at; };
  const iso = (v: string) => new Date(v).toISOString();

  for (const p of await fetchSince(sb, 'proyecto', since)) {
    track(p);
    const action = resolveRemote(await localState(db, 'proyecto', p.id), { modified: iso(p.modificado), deleted: p.borrado });
    if (action === 'deleteLocal') await db.runAsync('DELETE FROM proyecto WHERE id = ?', p.id);
    if (action === 'apply') {
      await db.runAsync(
        `INSERT INTO proyecto (id, usuario_id, nombre, tipo_espacio, altura_m, altura_conf, factor_k, es_demo, creado, modificado, pendiente)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, tipo_espacio = excluded.tipo_espacio, altura_m = excluded.altura_m,
           altura_conf = excluded.altura_conf, factor_k = excluded.factor_k, modificado = excluded.modificado, pendiente = 0`,
        p.id, userId, p.nombre, p.tipo_espacio, p.altura_m, p.altura_conf, p.factor_k, iso(p.creado), iso(p.modificado));
    }
  }

  const projectExists = async (id: string) => !!(await db.getFirstAsync('SELECT 1 FROM proyecto WHERE id = ?', id));

  for (const c of await fetchSince(sb, 'esquina', since)) {
    track(c);
    const action = resolveRemote(await localState(db, 'esquina', c.id), { modified: iso(c.modificado), deleted: c.borrado });
    if (action === 'deleteLocal') await db.runAsync('DELETE FROM esquina WHERE id = ?', c.id);
    if (action === 'apply' && (await projectExists(c.proyecto_id))) {
      // Un contorno re-marcado puede reutilizar el mismo «orden» con otro id: se reemplaza.
      await db.runAsync('DELETE FROM esquina WHERE proyecto_id = ? AND orden = ? AND id <> ?', c.proyecto_id, c.orden, c.id);
      await db.runAsync(
        `INSERT INTO esquina (id, proyecto_id, orden, x, z, confiabilidad, modificado, pendiente) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET orden = excluded.orden, x = excluded.x, z = excluded.z,
           confiabilidad = excluded.confiabilidad, modificado = excluded.modificado, pendiente = 0`,
        c.id, c.proyecto_id, c.orden, c.x, c.z, c.confiabilidad, iso(c.modificado));
    }
  }

  for (const m of await fetchSince(sb, 'medicion', since)) {
    track(m);
    const action = resolveRemote(await localState(db, 'medicion', m.id), { modified: iso(m.modificado), deleted: m.borrado });
    if (action === 'deleteLocal') await db.runAsync('DELETE FROM medicion WHERE id = ?', m.id);
    if (action === 'apply' && (await projectExists(m.proyecto_id))) {
      await db.runAsync(
        `INSERT OR REPLACE INTO medicion (id, proyecto_id, tipo, valor_m, a_x, a_y, a_z, b_x, b_y, b_z, confiabilidad, nivel, factores, creado, modificado, pendiente)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        m.id, m.proyecto_id, m.tipo, m.valor_m, m.a_x, m.a_y, m.a_z, m.b_x, m.b_y, m.b_z,
        m.confiabilidad, m.nivel, JSON.stringify(m.factores ?? {}), iso(m.creado), iso(m.modificado));
    }
  }

  for (const n of await fetchSince(sb, 'nota', since)) {
    track(n);
    const action = resolveRemote(await localState(db, 'nota', n.id), { modified: iso(n.modificado), deleted: n.borrado });
    if (action === 'deleteLocal') await db.runAsync('DELETE FROM nota WHERE id = ?', n.id);
    if (action === 'apply' && (await projectExists(n.proyecto_id))) {
      await db.runAsync(
        `INSERT OR REPLACE INTO nota (id, proyecto_id, foto_id, texto, creado, modificado, pendiente) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        n.id, n.proyecto_id, n.foto_id, n.texto, iso(n.creado), iso(n.modificado));
    }
  }

  await setCursor(db, userId, maxSync);
}

let running: Promise<void> | null = null;

/** Ejecuta una sincronización completa; llamadas simultáneas comparten la misma ejecución. */
export function syncNow(db: SQLiteDatabase, sb: SupabaseClient, userId: string): Promise<void> {
  running ??= (async () => {
    try {
      await push(db, sb, userId);
      await pull(db, sb, userId);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Al cerrar sesión: borra del teléfono los datos de la cuenta (quedan en la nube). Conserva el demo y ajustes. */
export async function wipeAccountData(db: SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM proyecto WHERE es_demo = 0');
    await tx.runAsync('DELETE FROM eliminado');
    await tx.runAsync("DELETE FROM sync_meta WHERE clave LIKE 'cursor:%'");
  });
}
