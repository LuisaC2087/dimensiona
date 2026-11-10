/** Crear proyecto (RF-10). */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createProject, SPACE_TYPES, type SpaceType } from '../db/repo';
import { Button, s } from '../components/ui';
import { colors, minTouch, space } from '../theme';

export default function NewProject() {
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [type, setType] = useState<SpaceType>('sala');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const p = await createProject(db, name.trim() || type[0].toUpperCase() + type.slice(1), type);
      router.replace(`/project/${p.id}`);
    } finally { setBusy(false); }
  };

  return (
    <View style={[s.screen, s.pad]}>
      <Text style={s.body}>Nombre</Text>
      <TextInput
        value={name} onChangeText={setName} placeholder="Ej.: Sala principal" placeholderTextColor={colors.textMuted}
        maxLength={60}
        style={{ minHeight: minTouch, color: colors.text, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: space.md, fontSize: 16 }}
      />
      <Text style={s.body}>Tipo de espacio</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {SPACE_TYPES.map((t) => (
          <Pressable key={t} onPress={() => setType(t)} accessibilityRole="radio" accessibilityState={{ selected: t === type }}
            style={{ minHeight: minTouch, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: 999,
              backgroundColor: t === type ? colors.accent : colors.surface }}>
            <Text style={{ color: t === type ? colors.onAccent : colors.text, fontSize: 16, fontWeight: '600' }}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.muted}>Si el nombre ya existe, se agregará un número al final.</Text>
      <Button label="Crear proyecto" onPress={create} loading={busy} />
    </View>
  );
}
