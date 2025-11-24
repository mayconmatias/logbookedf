// src/services/records.service.ts

import { calculateE1RM } from '@/utils/e1rm';
import { ExerciseStats } from '@/types/analytics';

export type PRKind = 'none' | 'e1rm' | 'reps';

export interface PRClassification {
  isPR: boolean;
  kind: PRKind;
  previousValue: number; // Pode ser e1rm ou reps antigos
  diffLabel: string;
}

/**
 * Classifica se é PR comparando a série atual com a tabela de estatísticas robusta.
 */
export function classifyPR(
  currWeight: number,
  currReps: number,
  stats: ExerciseStats | null
): PRClassification {
  const currentE1RM = calculateE1RM(currWeight, currReps);

  // 1. Se não tem estatísticas, é o primeiro treino da vida
  if (!stats || stats.total_sets === 0) {
    return {
      isPR: true,
      kind: 'e1rm', // Consideramos o primeiro como PR de base
      previousValue: 0,
      diffLabel: 'Novo Recorde (Base)',
    };
  }

  // 2. Verifica PR de Força (e1RM)
  // Usamos um pequeno epsilon (0.1) para evitar erros de arredondamento de float
  if (currentE1RM > (stats.max_e1rm + 0.1)) {
    const diff = currentE1RM - stats.max_e1rm;
    return {
      isPR: true,
      kind: 'e1rm',
      previousValue: stats.max_e1rm,
      diffLabel: `+${diff.toFixed(1)}kg e1RM`,
    };
  }

  // 3. Verifica PR de Repetições (Reps no mesmo peso)
  // O peso no JSON é string (chave). Buscamos o recorde para ESSE peso.
  const weightKey = currWeight.toString();
  const previousMaxReps = stats.max_reps_by_weight?.[weightKey] || 0;

  // [CORREÇÃO DO BUG DO ZERO]: Só é PR de reps se já existia histórico (>0) e superamos.
  if (previousMaxReps > 0 && currReps > previousMaxReps) {
    const diff = currReps - previousMaxReps;
    return {
      isPR: true,
      kind: 'reps',
      previousValue: previousMaxReps,
      diffLabel: `+${diff} reps (${currWeight}kg)`,
    };
  }

  // Nada de novo
  return {
    isPR: false,
    kind: 'none',
    previousValue: 0,
    diffLabel: '',
  };
}