/** Fotos y notas del proyecto (RF-14). Las notas se sincronizan; las fotos quedan en el teléfono. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { addPhoto, deletePhoto, listPhotos, PICK_MESSAGES, type Photo } from '../photos/photos';
import { deleteNote, listNotes, NOTE_MAX, saveNote, type Note } from '../db/notes';
import { useCloud } from '../state/CloudState';
import { Button, Card, s } from './ui';
import { colors, space } from '../theme';

/** Editor de una nota: crear (sin id) o editar. */
function NoteEditor(props: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(props.initial);
  return (
    <View style={{ gap: space.sm }}>
      <TextInput value={draft} onChangeText={setDraft} multiline maxLength={NOTE_MAX} placeholder="Escribe una nota…" autoFocus
        placeholderTextColor={colors.textMuted}
        style={{ color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, minHeight: 80, fontSize: 16, textAlignVertical: 'top' }} />
      <Text style={s.muted}>{draft.length}/{NOTE_MAX}</Text>
      <View style={s.row}>
        <Button label="Cancelar" variant="secondary" onPress={props.onCancel} />
        <Button label="Guardar nota" style={{ flex: 1 }} onPress={() => props.onSave(draft)} />
      </View>
    </View>
  );
}

export function PhotoGallery({ projectId }: { projectId: string }) {
  const db = useSQLiteContext();
  const { revision } = useCloud();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  /** id de nota, 'new' (nota general) o 'photo:<id>' (nueva nota de foto) */
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, n] = await Promise.all([listPhotos(db, projectId), listNotes(db, projectId)]);
    setPhotos(p); setNotes(n);
  }, [db, projectId]);
  useEffect(() => { load(); }, [load, revision]);

  const add = async (src: 'camera' | 'gallery') => {
    setMsg(null);
    const r = await addPhoto(db, projectId, src);
    if (!r.ok) return setMsg(PICK_MESSAGES[r.reason]);
    await load();
  };

  const save = async (text: string, opts: { id?: string; photoId?: string | null }) => {
    await saveNote(db, projectId, text, opts);
    setEditing(null);
    load();
  };

  const removePhoto = (p: Photo) => Alert.alert('Eliminar foto', 'Se borrará la foto y su nota.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => { await deletePhoto(db, p.id); load(); } },
  ]);

  const removeNote = (n: Note) => Alert.alert('Eliminar nota', 'La nota se borrará también de la nube.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteNote(db, projectId, n.id); load(); } },
  ]);

  const photoIds = new Set(photos.map((p) => p.id));
  // Notas generales y notas cuya foto no está en este teléfono (p. ej. creadas en otro dispositivo)
  const loose = notes.filter((n) => !n.photoId || !photoIds.has(n.photoId));

  const NoteView = ({ n }: { n: Note }) => editing === n.id ? (
    <NoteEditor initial={n.text} onCancel={() => setEditing(null)} onSave={(t) => save(t, { id: n.id })} />
  ) : (
    <View style={{ gap: space.xs }}>
      <Pressable onPress={() => setEditing(n.id)} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={s.body}>{n.text}</Text>
      </Pressable>
      <View style={s.row}>
        <Text style={s.muted}>{new Date(n.modified).toLocaleString('es-CO')}{n.photoId && !photoIds.has(n.photoId) ? ' · foto en otro teléfono' : ''}</Text>
        <Button label="Eliminar" variant="secondary" onPress={() => removeNote(n)} />
      </View>
    </View>
  );

  return (
    <View style={{ gap: space.sm }}>
      <Text style={s.h2}>Notas ({notes.length})</Text>
      {editing === 'new' ? (
        <Card><NoteEditor initial="" onCancel={() => setEditing(null)} onSave={(t) => save(t, {})} /></Card>
      ) : (
        <Button label="Agregar nota" variant="secondary" onPress={() => setEditing('new')} />
      )}
      {loose.map((n) => <Card key={n.id}><NoteView n={n} /></Card>)}

      <Text style={[s.h2, { marginTop: space.sm }]}>Fotos ({photos.length})</Text>
      <View style={s.row}>
        <Button label="Tomar foto" variant="secondary" style={{ flex: 1 }} onPress={() => add('camera')} />
        <Button label="Galería" variant="secondary" style={{ flex: 1 }} onPress={() => add('gallery')} />
      </View>
      {msg && <Text style={{ color: colors.warn, fontSize: 15 }}>{msg}</Text>}
      <Text style={s.muted}>Las fotos se guardan solo en este teléfono; sus notas también se guardan en la nube.</Text>
      {photos.map((p) => {
        const pn = notes.filter((n) => n.photoId === p.id);
        return (
          <Card key={p.id}>
            <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} resizeMode="cover" accessibilityLabel="Foto del proyecto" />
            {pn.map((n) => <NoteView key={n.id} n={n} />)}
            {editing === `photo:${p.id}` ? (
              <NoteEditor initial="" onCancel={() => setEditing(null)} onSave={(t) => save(t, { photoId: p.id })} />
            ) : (
              <View style={s.row}>
                {pn.length === 0 && <Button label="Agregar nota" variant="secondary" style={{ flex: 1 }} onPress={() => setEditing(`photo:${p.id}`)} />}
                <Button label="Eliminar foto" variant="secondary" onPress={() => removePhoto(p)} />
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}
