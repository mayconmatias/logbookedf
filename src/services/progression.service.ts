// src/services/progression.service.ts
import { supabase } from '@/lib/supabaseClient';
import {
  ExerciseAnalyticsData,
  ChartDataPoint,
  HistoricalSet,
} from '@/types/analytics';

import { calculateE1RM } from '@/utils/e1rm';

type ProgressionChartData = ChartDataPoint[];

export const getProgressionData = async (
  definitionId: string
): Promise<ProgressionChartData> => {
  if (!definitionId) {
    throw new Error('ID da Definição é necessário para buscar a progressão.');
  }

  try {
    const { data, error } = await supabase.rpc('get_accumulated_volume', {
      p_definition_id: definitionId,
    });

    if (error) {
      console.error('Erro ao buscar dados de progressão (volume):', error.message);
      throw new Error(`Falha ao buscar progressão: ${error.message}`);
    }

    return (data as ProgressionChartData) || [];
  } catch (err) {
    console.error('Erro inesperado no getProgressionData:', err);
    return [];
  }
};

/**
 * ========================================================================
 * FUNÇÃO PARA O SetShareModal (Card "Antes e Depois")
 * [ATUALIZADO] Agora aceita excludeWorkoutId para não pegar o PR atual como "Anterior"
 * ========================================================================
 */
export const fetchPreviousBestSet = async (
  definitionId: string,
  excludeWorkoutId?: string // <--- Parâmetro Novo
): Promise<HistoricalSet | null> => {
  if (!definitionId) {
    throw new Error('ID da definição é necessário para buscar PR anterior.');
  }

  try {
    const { data: userResponse, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userResponse.user) throw new Error('Usuário não autenticado.');

    // Query Base
    let query = supabase
      .from('sets')
      .select(`
        weight,
        reps,
        exercise:exercises!inner(
          definition_id,
          workout_id,
          workout:workouts!inner(
            workout_date,
            user_id
          )
        )
      `)
      .eq('exercise.definition_id', definitionId)
      .eq('exercise.workout.user_id', userResponse.user.id);

    // [CORREÇÃO] Se tivermos o ID da sessão atual, excluímos ela da busca
    if (excludeWorkoutId) {
      query = query.neq('exercise.workout_id', excludeWorkoutId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar PR anterior:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // Calcula e1RM em JS e escolhe a melhor série
    let best: HistoricalSet | null = null;

    for (const row of data as any[]) {
      const weight = Number(row.weight) || 0;
      const reps = Number(row.reps) || 0;

      if (weight <= 0 || reps <= 0) continue;

      const e1rm = calculateE1RM(weight, reps);
      const workoutDate = row.exercise?.workout?.workout_date ?? null;

      // Atualiza se for melhor
      if (!best || e1rm > (best.e1rm ?? 0)) {
        best = {
          date: workoutDate,
          weight,
          reps,
          e1rm,
        } as HistoricalSet;
      }
    }

    return best;
  } catch (err) {
    console.error('Erro inesperado no fetchPreviousBestSet:', err);
    return null;
  }
};


export const fetchExerciseAnalytics = async (
  definitionId: string,
  studentId?: string
): Promise<ExerciseAnalyticsData> => {
  if (!definitionId) {
    throw new Error('ID da Definição é necessário.');
  }

  try {
    const { data, error } = await supabase.rpc('get_exercise_analytics', {
      p_definition_id: definitionId,
      p_target_user_id: studentId || null
    });

    if (error) {
      console.error('Erro analytics:', error.message);
      throw new Error(error.message);
    }

    return data as ExerciseAnalyticsData;
  } catch (err) {
    console.error('Erro fetchExerciseAnalytics:', err);
    return {
      prStreakCount: 0,
      daysSinceLastPR: 0,
      bestSetAllTime: null,
      bestSetPreviousSession: null,
      historicalPRsList: [],
      chartDataE1RM: [],
      chartDataAccumulatedVolume: [],
      calendarData: [],
    };
  }
};