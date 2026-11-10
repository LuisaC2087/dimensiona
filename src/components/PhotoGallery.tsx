/** Galería y notas del proyecto (RF-14). */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { addPhoto, deletePhoto, listPhotos, NOTE_MAX, PICK_MESSAGES, setPhotoNote, type Photo } from '../photos/photos';
import { Button, Card, s } from './ui';
import { colors, space } from '../theme';

export function PhotoGallery({ projectId }: { projectId: string }) {
  const db = useSQLiteContext();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => setPhotos(await listPhotos(db, projectId)), [db, projectId]);
  useEffect(() => { load(); }, [load]);

  const add = async (src: 'camera' | 'gallery') => {
    setMsg(null);
    const r = await addPhoto(db, projectId, src);
    if (!r.ok) return setMsg(PICK_MESSAGES[r.reason]);
    await load();
  };

  const remove = (p: Photo) => Alert.alert('Eliminar foto', 'Se borrará la foto y su nota.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => { await deletePhoto(db, p.id); load(); } },
  ]);

  return (
    <View style={{ gap: space.sm }}>
      <Text style={s.h2}>Fotos y notas ({photos.length})</Text>
      <View style={s.row}>
        <Button label="Tomar foto" variant="secondary" style={{ flex: 1 }} onPress={() => add('camera')} />
        <Button label="Galería" variant="secondary" style={{ flex: 1 }} onPress={() => add('gallery')} />
      </View>
      {msg && <Text style={{ color: colors.warn, fontSize: 15 }}>{msg}</Text>}
      <Text style={s.muted}>Las fotos se guardan solo en este teléfono.</Text>
      {photos.map((p) => (
        <Card key={p.id}>
          <Image source={{ uri: p.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} resizeMode="cover" accessibilityLabel="Foto del proyecto" />
          {editing === p.id ? (
            <>
              <TextInput value={draft} onChangeText={setDraft} multiline maxLength={NOTE_MAX} placeholder="Escribe una nota…"
                placeholderTextColor={colors.textMuted}
                style={{ color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, minHeight: 80, fontSize: 16, textAlignVertical: 'top' }} />
              <Text style={s.muted}>{draft.length}/{NOTE_MAX}</Text>
              <View style={s.row}>
                <Button label="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
                <Button label="Guardar nota" style={{ flex: 1 }} onPress={async () => { await setPhotoNote(db, p.id, draft); setEditing(null); load(); }} />
              </View>
            </>
          ) : (
            <>
              <Pressable onPress={() => { setEditing(p.id); setDraft(p.note ?? ''); }} style={{ minHeight: 48, justifyContent: 'center' }}>
                <Text style={p.note ? s.body : s.muted}>{p.note ?? 'Toca para agregar una nota'}</Text>
              </Pressable>
              <View style={s.row}>
                <Text style={s.muted}>{new Date(p.date).toLocaleString('es-CO')}</Text>
                <Button label="Eliminar" variant="secondary" onPress={() => remove(p)} />
              </View>
            </>
          )}
        </Card>
      ))}
    </View>
  );
}
