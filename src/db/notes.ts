/**
 * RF-14: notas del proyecto (≤ 500 caracteres), opcionalmente ligadas a una foto.
 * Se sincronizan con la nube (CR-01); las fotos no.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { notifyLocalChange } from './changes';
import { newId, now } from './repo';

export const NOTE_MAX = 500;

export interface Note { id: string; photoId: string | null; text: string; created: string; modified: string }

export async function listNotes(db: SQLiteDatabase, projectId: string): Promise<Note[]> {
  const rows = await db.getAllAsync<{ id: string; foto_id: string | null; texto: string; creado: string; modificado: string }>(
    'SELECT * FROM nota WHERE proyecto_id = ? ORDER BY creado DESC', projectId);
  return rows.map((r) => ({ id: r.id, photoId: r.foto_id, text: r.texto, created: r.creado, modified: r.modificado }));
}

/** Crea o actualiza una nota. Texto vacío = eliminarla. */
export async function saveNote(db: SQLiteDatabase, projectId: string, text: string, opts: { id?: string; photoId?: string | null } = {}): Promise<void> {
  const clean = text.trim().slice(0, NOTE_MAX);
  if (!clean) {
    if (opts.id) await deleteNote(db, projectId, opts.id);
    return;
  }
  const t = now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    if (opts.id) {
      await tx.runAsync('UPDATE nota SET texto = ?, modificado = ?, pendiente = 1 WHERE id = ?', clean, t, opts.id);
    } else {
      await tx.runAsync('INSERT INTO nota (id, proyecto_id, foto_id, texto, creado, modificado, pendiente) VALUES (?, ?, ?, ?, ?, ?, 1)',
        newId(), projectId, opts.photoId ?? null, clean, t, t);
    }
    await tx.runAsync('UPDATE proyecto SET modificado = ?, pendiente = 1 WHERE id = ?', t, projectId);
  });
  notifyLocalChange();
}

export async function deleteNote(db: SQLiteDatabase, projectId: string, id: string): Promise<void> {
  const t = now();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('INSERT OR REPLACE INTO eliminado (tabla, id, fecha) VALUES (?, ?, ?)', 'nota', id, t);
    await tx.runAsync('DELETE FROM nota WHERE id = ?', id);
    await tx.runAsync('UPDATE proyecto SET modificado = ?, pendiente = 1 WHERE id = ?', t, projectId);
  });
  notifyLocalChange();
}

export async function deleteNotesOfPhoto(db: SQLiteDatabase, photoId: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; proyecto_id: string }>('SELECT id, proyecto_id FROM nota WHERE foto_id = ?', photoId);
  for (const r of rows) await deleteNote(db, r.proyecto_id, r.id);
}
