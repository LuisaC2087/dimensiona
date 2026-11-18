/** Resultados del proyecto: Plano / Datos (RF-07, RF-08, RF-09, RF-13, RF-10). */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  deleteMeasurement, deleteProject, getCorners, getProject, listMeasurements, setCalibration,
  type Corner, type Measurement, type Project,
} from '../../db/repo';
import {
  formatArea, formatLength, formatVolume, levelFor, roomMetrics, uncertainty, validateContour,
} from '../../lib';
import { useAppState } from '../../state/AppState';
import { useCloud } from '../../state/CloudState';
import { Plan2D } from '../../components/Plan2D';
import { Model3D } from '../../components/Model3D';
import { PhotoGallery } from '../../components/PhotoGallery';
import { deleteFiles } from '../../photos/photos';
import { Button, Card, Disclaimer, ReliabilityChip, ValueWithRange, s } from '../../components/ui';
import { colors, space } from '../../theme';

type Tab = 'plano' | '3d' | 'datos';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { settings, compat } = useAppState();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [tab, setTab] = useState<Tab>('plano');
  const { revision } = useCloud();

  const load = useCallback(async () => {
    void revision; // recargar cuando la nube trae cambios
    const [p, c, m] = await Promise.all([getProject(db, id), getCorners(db, id), listMeasurements(db, id)]);
    setProject(p); setCorners(c); setMeasurements(m);
  }, [db, id, revision]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (project === undefined) return <View style={s.screen} />;
  if (!project) {
    return (
      <View style={[s.screen, s.pad]}>
        <Text style={s.body}>Este proyecto ya no existe (pudo eliminarse en otro dispositivo).</Text>
      </View>
    );
  }

  const { unit, decimals } = settings;
  const validContour = corners.length >= 3 && validateContour(corners).length === 0;
  const metrics = validContour ? roomMetrics(corners, project.heightM, project.k) : null;
  const contourConf = corners.length ? Math.min(...corners.map((c) => c.confidence)) : null;
  const volumeConf = contourConf != null && project.heightConf != null ? Math.min(contourConf, project.heightConf) : contourConf;
  const pm = (v: number, conf: number) => uncertainty(v, levelFor(conf));

  const confirmDelete = () =>
    Alert.alert('Eliminar proyecto', `Se borrarán «${project.name}», sus mediciones, fotos y notas.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { deleteFiles(await deleteProject(db, id)); router.back(); } },
    ]);

  const scan = (mode: string) => (compat?.canScan ? router.push(`/scan/${id}?mode=${mode}`) : router.push('/compat'));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: project.name }} />
      <View style={s.row}>
        {(['plano', '3d', 'datos'] as Tab[]).map((t) => (
          <Button key={t} label={t === 'plano' ? 'Plano' : t === '3d' ? '3D' : 'Datos'} variant={t === tab ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setTab(t)} />
        ))}
      </View>

      {tab === 'plano' && (metrics ? (
        <Plan2D corners={corners} walls={metrics.walls} areaM2={metrics.floorArea} unit={unit} decimals={decimals} />
      ) : (
        <Card style={{ borderLeftColor: colors.textMuted }}>
          <Text style={s.body}>Aún no hay contorno; marca las esquinas.</Text>
        </Card>
      ))}

      {tab === '3d' && (metrics && project.heightM != null ? (
        <Model3D corners={corners} heightM={project.heightM * project.k} unit={unit} decimals={decimals} />
      ) : metrics ? (
        <View style={{ gap: space.sm }}>
          <Plan2D corners={corners} walls={metrics.walls} areaM2={metrics.floorArea} unit={unit} decimals={decimals} />
          <Card style={{ borderLeftColor: colors.warn }}>
            <Text style={s.body}>Falta la altura para ver el modelo 3D. Regístrala para completarlo.</Text>
            <Button label="Marcar altura" variant="secondary" onPress={() => scan('height')} />
          </Card>
        </View>
      ) : (
        <Card style={{ borderLeftColor: colors.textMuted }}><Text style={s.body}>Aún no hay contorno; marca las esquinas.</Text></Card>
      ))}

      {metrics && contourConf != null && (
        <View style={{ gap: space.sm }}>
          <Card>
            <View style={s.row}><Text style={s.muted}>Área del piso</Text><ReliabilityChip score={contourConf} /></View>
            <Text style={[s.value, { color: colors.accent }]}>
              {formatArea(metrics.floorArea, decimals)} <Text style={s.muted}>± {formatArea(pm(metrics.floorArea, contourConf), decimals)}</Text>
            </Text>
          </Card>
          <Card>
            <View style={s.row}><Text style={s.muted}>Perímetro</Text><ReliabilityChip score={contourConf} /></View>
            <Text style={s.value}>{formatLength(metrics.perimeter, unit, decimals)} <Text style={s.muted}>± {formatLength(pm(metrics.perimeter, contourConf), unit, decimals)}</Text></Text>
          </Card>
          {metrics.volume != null && volumeConf != null ? (
            <>
              <Card>
                <View style={s.row}><Text style={s.muted}>Volumen</Text><ReliabilityChip score={volumeConf} /></View>
                <Text style={s.value}>{formatVolume(metrics.volume, decimals)} <Text style={s.muted}>± {formatVolume(pm(metrics.volume, volumeConf), decimals)}</Text></Text>
              </Card>
              <Card>
                <View style={s.row}><Text style={s.muted}>Área de paredes</Text><ReliabilityChip score={volumeConf} /></View>
                <Text style={s.value}>{formatArea(metrics.wallArea!, decimals)}</Text>
              </Card>
            </>
          ) : (
            <Card style={{ borderLeftColor: colors.warn }}>
              <Text style={s.body}>Falta la altura para calcular el volumen y el área de paredes.</Text>
              <Button label="Marcar altura" variant="secondary" onPress={() => scan('height')} />
            </Card>
          )}
        </View>
      )}

      {tab === 'datos' && (
        <View style={{ gap: space.sm }}>
          {metrics && (
            <Card>
              <Text style={s.h2}>Paredes</Text>
              {metrics.walls.map((w, i) => (
                <View key={i} style={s.row}>
                  <Text style={s.body}>P{i + 1}</Text>
                  <Text style={s.body}>{formatLength(w, unit, decimals)}</Text>
                  <ReliabilityChip score={Math.min(corners[i].confidence, corners[(i + 1) % corners.length].confidence)} />
                </View>
              ))}
            </Card>
          )}
          {project.heightM != null && project.heightConf != null && (
            <Card><Text style={s.muted}>Altura</Text>
              <ValueWithRange valueM={project.heightM * project.k} score={project.heightConf} unit={unit} decimals={decimals} />
            </Card>
          )}
          <Text style={s.h2}>Mediciones ({measurements.length})</Text>
          {measurements.map((m) => (
            <Card key={m.id} style={{ borderLeftColor: levelFor(m.confidence) === 'Baja' ? colors.danger : colors.accent }}>
              <Text style={s.muted}>{m.kind}</Text>
              <ValueWithRange valueM={m.valueM * project.k} score={m.confidence} unit={unit} decimals={decimals} />
              <Text style={s.muted}>
                Factores: seguimiento {fmtF(m.factors.T)} · superficie {fmtF(m.factors.P)} · distancia {fmtF(m.factors.D)}{m.factors.partial ? ' · parcial' : ''}
              </Text>
              {levelFor(m.confidence) === 'Baja' && (
                <Text style={{ color: colors.danger, fontSize: 15 }}>Confiabilidad baja: {lowCause(m)}. Te recomendamos repetir la medición.</Text>
              )}
              <View style={s.row}>
                {levelFor(m.confidence) === 'Baja' && <Button label="Repetir medición" variant="secondary" onPress={() => scan('distance')} />}
                <Button label="Borrar" variant="secondary" onPress={async () => { await deleteMeasurement(db, id, m.id); load(); }} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {tab === 'datos' && (
        <Card>
          <View style={s.row}>
            <Text style={s.h2}>Calibración</Text>
            <Text style={s.body}>k = {project.k.toFixed(3).replace('.', ',')}</Text>
          </View>
          <Text style={s.muted}>{project.k === 1 ? 'Sin calibrar. Calibra con un objeto de medida conocida para corregir la escala.' : 'Todas las medidas del proyecto están corregidas con este factor.'}</Text>
          <View style={s.row}>
            <Button label="Calibrar" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/calibrate/${id}`)} />
            {project.k !== 1 && <Button label="Quitar" variant="secondary" onPress={async () => { await setCalibration(db, id, 1); load(); }} />}
          </View>
        </Card>
      )}

      {tab === 'datos' && <PhotoGallery projectId={id} />}

      <View style={{ gap: space.sm }}>
        <Button label={corners.length ? 'Volver a escanear la habitación' : 'Escanear habitación'} onPress={() => scan('room')} />
        <Button label="Medir distancia" variant="secondary" onPress={() => scan('distance')} />
        {!project.isDemo && <Button label="Eliminar proyecto" variant="danger" onPress={confirmDelete} />}
      </View>
      <Disclaimer />
    </ScrollView>
  );
}

const fmtF = (v: unknown) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '—');

function lowCause(m: Measurement): string {
  const f = m.factors as Record<string, number>;
  const entries: [string, number | undefined][] = [
    ['el seguimiento era limitado', f.T], ['el punto no estaba sobre una superficie detectada', f.P], ['estabas lejos del punto', f.D],
  ];
  const worst = entries.filter(([, v]) => typeof v === 'number').sort((a, b) => a[1]! - b[1]!)[0];
  return worst ? worst[0] : 'faltan datos';
}
