import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Tipos globais
import type { WorkoutHistoryItem } from '@/types/workout';
import type {
  HistoricalRepPR as RepPR,
  HistoricalWeightPR as WeightPR,
} from '@/types/workout';

interface ShareableCardProps {
  workout: WorkoutHistoryItem | null;
  bgOpacity: number;
  repPRs: RepPR[];
  weightPRs: WeightPR[];
  fullScreen?: boolean;
}

interface GroupedSet {
  count: number;
  weight: number;
  reps: number;
  tag: string;
  side?: 'E' | 'D';
}

/**
 * Agrupa séries idênticas e calcula tags de PR.
 */
const getGroupedSetsData = (
  definitionId: string,
  sets: any[],
  repPRs: RepPR[],
  weightPRs: WeightPR[]
): GroupedSet[] => {
  if (!sets || sets.length === 0) return [];

  const groups: GroupedSet[] = [];

  const historicalWeightPR =
    weightPRs.find(pr => pr.definition_id === definitionId)?.max_weight || 0;

  sets.forEach(set => {
    // Ignora séries zeradas (ghost sets)
    if (set.weight === 0 && set.reps === 0) return;

    const side = set.side || undefined;

    const existing = groups.find(
      g => g.weight === set.weight && g.reps === set.reps && g.side === side
    );

    if (existing) {
      existing.count += 1;
    } else {
      // CORREÇÃO DO BUG RP: Busca o recorde de reps PARA ESTE PESO ESPECÍFICO
      const historicalRepPR =
        repPRs.find(
          pr =>
            pr.definition_id === definitionId &&
            Math.abs(pr.weight - set.weight) < 0.1 
        )?.max_reps || 0;

      let tag = '';

      // 1. RP de Carga Absoluta
      if (set.weight > historicalWeightPR && historicalWeightPR > 0) {
        tag = ' (RP)';
      } 
      // 2. RP de Repetições (com mesmo peso)
      // Só marca se já existia um histórico (>0) e superamos ele.
      else if (historicalRepPR > 0 && set.reps > historicalRepPR) {
        tag = ' (RP de reps)';
      }

      groups.push({
        count: 1,
        weight: set.weight,
        reps: set.reps,
        tag,
        side,
      });
    }
  });

  // Ordena por peso (decrescente) para mostrar as séries mais pesadas primeiro
  groups.sort((a, b) => b.weight - a.weight);

  return groups;
};

export default function ShareableCard({
  workout,
  bgOpacity,
  repPRs,
  weightPRs,
  fullScreen,
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
    const MAX_LINES_TOTAL = 18; // Limite total do card
    const MAX_LINES_PER_EXERCISE = 3; // Limite específico por exercício

    const performed = (workout as any).performed_data || [];

    let currentTotalLines = 0;
    const items: JSX.Element[] = [];
    let remainingExercises = 0;
    let stopRenderingExercises = false;

    for (const ex of performed) {
      if (stopRenderingExercises) {
        remainingExercises++;
        continue;
      }

      const sets = ex.sets || [];
      if (!sets.length) continue;

      // 1. Processa os grupos de séries
      const groups = getGroupedSetsData(ex.definition_id, sets, repPRs, weightPRs);
      
      // 2. Aplica a lógica de truncamento do exercício (Máx 3 linhas)
      let linesToRender: string[] = [];
      
      if (groups.length <= MAX_LINES_PER_EXERCISE) {
        // Caso caiba tudo
        linesToRender = groups.map(g => {
          const side = g.side ? ` (${g.side})` : '';
          return `${g.count} x ${g.weight}kg para ${g.reps} reps${side}${g.tag}`;
        });
      } else {
        // Caso estoure 3 linhas: Pega as 2 primeiras (mais pesadas) e resume o resto
        const topGroups = groups.slice(0, MAX_LINES_PER_EXERCISE - 1);
        const restGroups = groups.slice(MAX_LINES_PER_EXERCISE - 1);

        // Formata as top (com detalhe completo)
        linesToRender = topGroups.map(g => {
          const side = g.side ? ` (${g.side})` : '';
          return `${g.count} x ${g.weight}kg para ${g.reps} reps${side}${g.tag}`;
        });

        // [CORREÇÃO]: Cria o resumo da sobra SEM PESO
        const totalSetsRest = restGroups.reduce((acc, g) => acc + g.count, 0);
        const minReps = Math.min(...restGroups.map(g => g.reps));
        const maxReps = Math.max(...restGroups.map(g => g.reps));
        
        const repsRange = minReps === maxReps ? `${minReps}` : `${minReps}-${maxReps}`;
        
        // Ex: "+ 3 séries de 10-12 reps"
        linesToRender.push(`+ ${totalSetsRest} séries de ${repsRange} reps`);
      }

      // 3. Verifica se cabe no card inteiro
      const exerciseCost = 1 + linesToRender.length;

      if (currentTotalLines + exerciseCost <= MAX_LINES_TOTAL) {
        items.push(
          <View style={styles.exercise} key={ex.id || ex.name}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <View style={styles.setsContainer}>
              {linesToRender.map((line, idx) => (
                <Text style={styles.setsText} key={idx}>
                  {line}
                </Text>
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

  const gradientColors: [string, string] = [
    `rgba(35,37,38,${bgOpacity})`,
    `rgba(65,67,69,${bgOpacity})`,
  ];

  const cardContent = (
    <View
      style={[
        styles.cardBase,
        fullScreen ? styles.cardFullScreen : styles.cardDefault,
      ]}
    >
      <View style={styles.topSection}>
        <Text style={styles.header}>Logbook da Escola de Força</Text>
        <Text style={styles.title}>{workoutName}</Text>
      </View>

      <View style={styles.middleSection}>
        <View style={styles.body}>
          {renderWorkoutBody()}
        </View>
      </View>

      <View style={styles.bottomSection}>
        <Text style={styles.footer}>
          Esse app é gratuito, use o cupom MAYCAO na Growth Supplements pra apoiar o projeto!
        </Text>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={gradientColors}
      style={[
        styles.containerBase,
        fullScreen ? styles.containerFullScreen : styles.containerCard,
      ]}
    >
      {cardContent}
    </LinearGradient>
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