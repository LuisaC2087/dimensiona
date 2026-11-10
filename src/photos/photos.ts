/**
 * RF-14: fotos (JPEG en el almacenamiento privado de la app). Las notas viven en src/db/notes.ts.
 * Las fotos nunca se suben a la nube (CR-01).
 * expo-image-picker se carga bajo demanda: si el APK instalado no lo trae, se avisa en vez de cerrarse.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { newId, now } from '../db/repo';
import { deleteNotesOfPhoto } from '../db/notes';

export interface Photo { id: string; uri: string; measurementId: string | null; date: string }

function photosDir(): Directory {
  const d = new Directory(Paths.document, 'fotos');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export type PickResult = { ok: true; photo: Photo } | { ok: false; reason: 'cancel' | 'permission' | 'unavailable' | 'storage' };

export async function addPhoto(db: SQLiteDatabase, projectId: string, source: 'camera' | 'gallery', measurementId?: string): Promise<PickResult> {
  let picker: typeof import('expo-image-picker');
  try {
    picker = await import('expo-image-picker');
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (source === 'camera') {
    const perm = await picker.requestCameraPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'permission' };
  }
  const opts = { mediaTypes: ['images'] as ('images')[], quality: 0.7, exif: false };
  const res = source === 'camera' ? await picker.launchCameraAsync(opts) : await picker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return { ok: false, reason: 'cancel' };

  const id = newId();
  try {
    if (Paths.availableDiskSpace < 5 * 1024 * 1024) return { ok: false, reason: 'storage' };
    const dest = new File(photosDir(), `${id}.jpg`);
    new File(res.assets[0].uri).copy(dest);
    const photo: Photo = { id, uri: dest.uri, measurementId: measurementId ?? null, date: now() };
    await db.runAsync('INSERT INTO foto (id, proyecto_id, medicion_id, ruta, fecha) VALUES (?, ?, ?, ?, ?)',
      id, projectId, photo.measurementId, photo.uri, photo.date);
    return { ok: true, photo };
  } catch {
    return { ok: false, reason: 'storage' };
  }
}

export async function listPhotos(db: SQLiteDatabase, projectId: string): Promise<Photo[]> {
  const rows = await db.getAllAsync<{ id: string; ruta: string; medicion_id: string | null; fecha: string }>(
    'SELECT * FROM foto WHERE proyecto_id = ? ORDER BY fecha DESC', projectId);
  return rows.map((r) => ({ id: r.id, uri: r.ruta, measurementId: r.medicion_id, date: r.fecha }));
}

export function deleteFiles(uris: string[]): void {
  for (const uri of uris) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // archivo ya inexistente: nada que hacer
    }
  }
}

export async function deletePhoto(db: SQLiteDatabase, id: string): Promise<void> {
  const r = await db.getFirstAsync<{ ruta: string }>('SELECT ruta FROM foto WHERE id = ?', id);
  await deleteNotesOfPhoto(db, id);
  await db.runAsync('DELETE FROM foto WHERE id = ?', id);
  if (r) deleteFiles([r.ruta]);
}

export const PICK_MESSAGES: Record<Exclude<PickResult, { ok: true }>['reason'], string | null> = {
  cancel: null,
  permission: 'Sin permiso de cámara. Actívalo en Ajustes del teléfono › Permisos › Cámara.',
  unavailable: 'Esta versión instalada no incluye fotos. Instala la versión más reciente de la app.',
  storage: 'No hay espacio suficiente en el teléfono para guardar la foto.',
};
