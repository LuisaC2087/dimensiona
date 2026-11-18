/** Inicio / Proyectos (RF-10, RF-16). */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listProjects, type ProjectSummary } from '../db/repo';
import { formatArea } from '../lib';
import { useAppState } from '../state/AppState';
import { CompatBanner } from '../components/CompatBanner';
import { SyncBadge } from '../components/SyncBadge';
import { useCloud } from '../state/CloudState';
import { Button, ReliabilityChip, s } from '../components/ui';
import { colors, space } from '../theme';

export default function Home() {
  const db = useSQLiteContext();
  const { settings } = useAppState();
  const { revision } = useCloud();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  // revision: recargar cuando la nube trae cambios
  useFocusEffect(useCallback(() => { void revision; listProjects(db).then(setProjects); }, [db, revision]));

  if (!settings.tutorialSeen) return <Redirect href="/tutorial" />;

  const demo = projects.find((p) => p.isDemo);

  return (
    <View style={s.screen}>
      <FlatList
        contentContainerStyle={[s.pad, { paddingBottom: 48 }]}
        data={projects}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <CompatBanner />
            <Pressable accessibilityRole="button" accessibilityLabel="Medir un objeto o una distancia"
              onPress={() => router.push('/measure')}
              style={({ pressed }) => [hero, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={[heroTitle, { color: colors.onAccent }]}>📏 Medir</Text>
              <Text style={{ color: colors.onAccent, fontSize: 15 }}>Un objeto (se detecta solo) o una distancia, en m o cm</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Escanear una habitación"
              onPress={() => router.push('/new')}
              style={({ pressed }) => [hero, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={[heroTitle, { color: colors.text }]}>🏠 Escanear habitación</Text>
              <Text style={s.muted}>Plano, área, altura y modelo 3D. Se guarda como proyecto</Text>
            </Pressable>
            <SyncBadge />
            <View style={s.row}>
              <Button label="Ver demostración" variant="secondary" style={{ flex: 1 }}
                onPress={() => demo && router.push(`/project/${demo.id}`)} />
              <Button label="Cómo medir" variant="secondary" onPress={() => router.push('/tutorial')} />
              <Button label="Ajustes" variant="secondary" onPress={() => router.push('/settings')} />
            </View>
            <Text style={s.h1}>Mis proyectos</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/project/${item.id}`)} style={[s.card, { marginBottom: space.sm }]}>
            <View style={s.row}>
              <Text style={s.h2} numberOfLines={1}>{item.name}</Text>
              {item.minConfidence != null && <ReliabilityChip score={item.minConfidence} />}
            </View>
            <Text style={s.muted}>
              {item.spaceType} · {item.areaM2 != null ? formatArea(item.areaM2, settings.decimals) : 'sin contorno'} · {item.measurementCount} mediciones
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={s.muted}>Aún no tienes proyectos.</Text>}
      />
    </View>
  );
}

const hero = { borderRadius: 16, padding: space.md, minHeight: 88, justifyContent: 'center', gap: 4 } as const;
const heroTitle = { fontSize: 24, fontWeight: '800' } as const;
