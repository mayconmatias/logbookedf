import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import type { WorkoutHistoryItem } from '@/types/workout';
import type {
  HistoricalRepPR as RepPR,
  HistoricalWeightPR as WeightPR,
} from '@/types/workout';
import {
  Canvas,
  RoundedRect,
  Rect,
  LinearGradient as SkiaLinearGradient,
  vec,
  Skia,
  Mask,
  BlurMask,
  Group
} from "@shopify/react-native-skia";

interface ShareableCardProps {
  workout: WorkoutHistoryItem | null;
  bgOpacity: number;
  repPRs: RepPR[];
  weightPRs: WeightPR[];
  fullScreen?: boolean;
  musicVisibility?: 'none' | 'all' | 'prs' | 'heaviest';
  textColor?: string;
  musicColor?: string;
  colors?: string[];
  borderRadius?: number;
  feather?: number;
}

import { LayoutChangeEvent } from 'react-native';
import { useState } from 'react';

interface GroupedSet {
  count: number;
  weight: number;
  reps: number;
  tag: string;
  side?: 'E' | 'D';
  music?: any;
}

const getGroupedSetsData = (
  definitionId: string,
  sets: any[],
  repPRs: RepPR[],
  weightPRs: WeightPR[],
  musicVisibility?: 'none' | 'all' | 'prs' | 'heaviest',
  allExercisesSets?: any[]
): GroupedSet[] => {
  if (!sets || sets.length === 0) return [];

  const groups: GroupedSet[] = [];

  const historicalWeightPR =
    weightPRs.find(pr => pr.definition_id === definitionId)?.max_weight || 0;

  sets.forEach(set => {
    if (set.weight === 0 && set.reps === 0) return;

    const side = set.side || undefined;

    // Verificamos se a música deve ser exibida para este set específico
    let shouldShowMusic = true;
    if (musicVisibility === 'none') {
      shouldShowMusic = false;
    } else if (musicVisibility === 'prs') {
      const historicalWeightPR = weightPRs.find(pr => pr.definition_id === definitionId)?.max_weight || 0;
      const historicalRepPR = repPRs.find(pr => pr.definition_id === definitionId && Math.abs(pr.weight - set.weight) < 0.1)?.max_reps || 0;

      const isWeightPR = set.weight > historicalWeightPR && historicalWeightPR > 0;
      const isRepPR = historicalRepPR > 0 && set.reps > historicalRepPR;

      shouldShowMusic = isWeightPR || isRepPR;
    } else if (musicVisibility === 'heaviest') {
      const maxWeight = Math.max(...sets.map(s => s.weight));
      // Only show for the very first set of the day that reaches this weight if multiple exist
      // or simply show for all that reach it. User said "somente nas séries mais pesadas".
      // Let's ensure it only shows for one set if multiple exist with same weight inside same group logic?
      // Actually groups are ALREADY grouped by weight.
      shouldShowMusic = set.weight === maxWeight;
    }

    const musicToStore = shouldShowMusic ? set.music_data : null;
    const musicKey = musicToStore
      ? `${musicToStore.track || '???'} - ${musicToStore.artist || '???'}`
      : 'no-music';

    const existing = groups.find(
      g => g.weight === set.weight &&
        g.reps === set.reps &&
        g.side === side &&
        (g.music ? `${g.music.track}-${g.music.artist}` : 'no-music') === musicKey
    );

    if (existing) {
      existing.count += 1;
    } else {
      const historicalRepPR =
        repPRs.find(
          pr =>
            pr.definition_id === definitionId &&
            Math.abs(pr.weight - set.weight) < 0.1
        )?.max_reps || 0;

      let tag = '';

      if (set.weight > historicalWeightPR && historicalWeightPR > 0) {
        tag = ' (RP)';
      }
      else if (historicalRepPR > 0 && set.reps > historicalRepPR) {
        tag = ' (RP de reps)';
      }

      groups.push({
        count: 1,
        weight: set.weight,
        reps: set.reps,
        tag,
        side,
        music: musicToStore,
      });
    }
  });

  groups.sort((a, b) => b.weight - a.weight);

  return groups;
};

export default function ShareableCard({
  workout,
  bgOpacity,
  repPRs,
  weightPRs,
  fullScreen,
  musicVisibility = 'all',
  textColor = '#FFFFFF',
  musicColor = '#1DB954',
  colors = ['#232526', '#414345'],
  borderRadius = 20,
  feather = 0,
}: ShareableCardProps) {
  if (!workout) return null;

  const getWorkoutName = () => {
    if (workout.template_name) {
      return workout.template_name;
    }
    const [year, month, day] = workout.workout_date.split('-');
    return `Treino do dia ${day}/${month}`;
  };

  const workoutName = getWorkoutName();

  const renderWorkoutBody = () => {
    const hasAnyMusic = workout.performed_data.some(ex => ex.sets.some(s => s.music_data));
    // [MELHORIA] Se houver muita música, diminuímos o número de exercícios mostrados para caber tudo
    const MAX_LINES_TOTAL = hasAnyMusic ? 14 : 18;
    const MAX_LINES_PER_EXERCISE = 3;

    const performed = workout.performed_data || [];

    let currentTotalLines = 0;
    const items: React.JSX.Element[] = [];

    let remainingExercises = 0;
    let stopRenderingExercises = false;

    for (const ex of performed) {
      if (stopRenderingExercises) {
        remainingExercises++;
        continue;
      }

      const sets = ex.sets || [];
      if (!sets.length) continue;

      const groups = getGroupedSetsData(ex.definition_id, sets, repPRs, weightPRs, musicVisibility);

      let linesToRender: Array<{ text: string, music?: any }> = [];

      if (groups.length <= MAX_LINES_PER_EXERCISE) {
        linesToRender = groups.map(g => {
          const side = g.side ? ` (${g.side})` : '';
          return {
            text: `${g.count} x ${g.weight}kg para ${g.reps} reps${side}${g.tag}`,
            music: g.music
          };
        });
      } else {
        const topGroups = groups.slice(0, MAX_LINES_PER_EXERCISE - 1);
        const restGroups = groups.slice(MAX_LINES_PER_EXERCISE - 1);

        linesToRender = topGroups.map(g => {
          const side = g.side ? ` (${g.side})` : '';
          return {
            text: `${g.count} x ${g.weight}kg para ${g.reps} reps${side}${g.tag}`,
            music: g.music
          };
        });

        const totalSetsRest = restGroups.reduce((acc, g) => acc + g.count, 0);
        const minReps = Math.min(...restGroups.map(g => g.reps));
        const maxReps = Math.max(...restGroups.map(g => g.reps));

        const repsRange = minReps === maxReps ? `${minReps}` : `${minReps}-${maxReps}`;

        linesToRender.push({
          text: `+ ${totalSetsRest} séries de ${repsRange} reps`
        });
      }

      // Cálculo de "custo" de linhas: título do exercício + total de linhas de sets
      // Consideramos que uma linha com música "custa" 1.5 linha no visual
      const exerciseCost = 1 + linesToRender.reduce((acc, l) => acc + (l.music ? 1.6 : 1), 0);

      if (currentTotalLines + exerciseCost <= MAX_LINES_TOTAL) {
        items.push(
          <View style={styles.exercise} key={ex.id || ex.name}>
            <Text style={[styles.exerciseName, { color: textColor }]}>{ex.name}</Text>
            <View style={styles.setsContainer}>
              {linesToRender.map((line, idx) => (
                <View key={idx} style={styles.setLineWrapper}>
                  <Text style={[styles.setsText, { color: textColor, opacity: 0.9 }]}>{line.text}</Text>
                  {line.music && (
                    <View style={styles.inlineMusicContainer}>
                      <Feather name="music" size={10} color={musicColor} style={{ marginRight: 4, opacity: 0.8 }} />
                      <Text style={[styles.inlineMusicText, { color: musicColor, opacity: 0.8 }]} numberOfLines={1}>
                        {line.music.track} • {line.music.artist}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
        currentTotalLines += exerciseCost;
      } else {
        stopRenderingExercises = true;
        remainingExercises++;
      }
    }

    return (
      <>
        {items}
        {remainingExercises > 0 && (
          <Text style={styles.truncationText}>
            ...e mais {remainingExercises} exercício(s)
          </Text>
        )}
      </>
    );
  };

  const hexToRgba = (hex: string, opacity: number) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${opacity})`;
  };

  const gradientColors = colors.map(c => hexToRgba(c, bgOpacity));

  const cardContent = (
    <View
      style={[
        styles.cardBase,
        fullScreen ? styles.cardFullScreen : styles.cardDefault,
      ]}
    >
      <View style={styles.topSection}>
        <Text style={[styles.header, { color: textColor, opacity: 0.6 }]}>Logbook da Escola de Força</Text>
        <Text style={[styles.title, { color: textColor }]}>{workoutName}</Text>
      </View>

      <View style={styles.middleSection}>
        <View style={styles.body}>
          {renderWorkoutBody()}
        </View>
      </View>

      <View style={styles.bottomSection}>
        <Text style={[styles.footer, { color: textColor, opacity: 0.7 }]}>
          Esse app é gratuito, use o cupom MAYCAO na Growth Supplements pra apoiar o projeto!
        </Text>
      </View>
    </View>
  );

  const { width: SCREEN_WIDTH } = Dimensions.get('window');

  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        fullScreen ? styles.containerFullScreen : styles.containerCard,
        {
          borderRadius: feather > 0 ? 0 : borderRadius,
          backgroundColor: 'transparent',
          overflow: feather > 0 ? 'visible' : 'hidden'
        },
      ]}
    >
      <View style={StyleSheet.absoluteFillObject}>
        <Canvas style={{ flex: 1 }}>
          <Group opacity={bgOpacity}>
            <Mask
              mask={
                <RoundedRect
                  x={feather}
                  y={feather}
                  width={layout.width - 2 * feather}
                  height={layout.height - 2 * feather}
                  r={Math.max(0, borderRadius - feather)}
                  color="black"
                >
                  <BlurMask blur={feather} style="normal" />
                </RoundedRect>
              }
            >
              <Rect x={0} y={0} width={layout.width} height={layout.height}>
                <SkiaLinearGradient
                  start={vec(0, 0)} end={vec(0, layout.height)}
                  colors={colors.map(c => Skia.Color(c))}
                />
              </Rect>
            </Mask>
          </Group>
        </Canvas>
      </View>

      <View style={fullScreen ? { flex: 1 } : {}}>
        {cardContent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerBase: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerCard: {
    width: 400,
    padding: 24,
  },
  containerFullScreen: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 24,
    paddingVertical: 40,
    borderRadius: 0,
  },
  cardBase: {
    backgroundColor: 'transparent',
  },
  cardDefault: {},
  cardFullScreen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0AEC0',
    marginBottom: 4,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    marginBottom: 20,
  },
  exercise: {
    marginBottom: 12,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  setsContainer: {
    alignItems: 'flex-start',
    rowGap: 2,
  },
  setsText: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  setLineWrapper: {
    marginBottom: 6,
  },
  inlineMusicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
    opacity: 0.9,
  },
  inlineMusicText: {
    fontSize: 11,
    color: '#1DB954', // Spotify green
    fontWeight: '600',
    fontStyle: 'italic',
  },
  truncationText: {
    fontSize: 14,
    color: '#A0AEC0',
    marginTop: 10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 16,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  middleSection: {
    flexShrink: 1,
    marginVertical: 12,
  },
  bottomSection: {
    marginTop: 8,
  },
});