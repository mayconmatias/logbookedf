// src/services/progression.service.ts
import { supabase } from '@/lib/supabaseClient';
import {
  ExerciseAnalyticsData,
  ChartDataPoint,
  HistoricalSet,
  CalendarDay,
} from '@/types/analytics';

import { calculateE1RM } from '@/utils/e1rm';

/**
 * Define o tipo de retorno para os dados de progressão do "Tijolo & Pilha".
 */
type ProgressionChartData = ChartDataPoint[];

/**
 * ========================================================================
 * FUNÇÃO PARA O ProgressionShareModal (Gráfico "Tijolo & Pilha")
 * [ATUALIZADO] Usa 'definitionId'
 * ========================================================================
 */
export const getProgressionData = async (
  definitionId: string
): Promise<ProgressionChartData> => {
  if (!definitionId) {
    throw new Error('ID da Definição é necessário para buscar a progressão.');
  }

  try {
    // Assumindo que a RPC 'get_accumulated_volume' foi atualizada
    // para aceitar 'p_definition_id' e fazer o JOIN e.definition_id
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
 * [ATUALIZADO] Esta query agora é complexa e precisa de JOINs
 * ========================================================================
 */

export const fetchPreviousBestSet = async (
  definitionId: string
): Promise<HistoricalSet | null> => {
  if (!definitionId) {
    throw new Error('ID da definição é necessário para buscar PR anterior.');
  }

  try {
    const { data: userResponse, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userResponse.user) throw new Error('Usuário não autenticado.');

    // Buscamos TODAS as séries daquele exercício para aquele usuário
    const { data, error } = await supabase
      .from('sets')
      .select(`
        weight,
        reps,
        exercise:exercises!inner(
          definition_id,
          workout:workouts!inner(
            workout_date,
            user_id
          )
        )
      `)
      .eq('exercise.definition_id', definitionId)
      .eq('exercise.workout.user_id', userResponse.user.id);

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

      // se tiver algo bizarro, ignora
      if (weight <= 0 || reps <= 0) continue;

      const e1rm = calculateE1RM(weight, reps);
      const workoutDate = row.exercise?.workout?.workout_date ?? null;

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


/**
 * ========================================================================
 * FUNÇÃO PARA O ExerciseAnalyticsSheet (Redesenho Atual)
 * [ATUALIZADO] Usa 'definitionId'
 * ========================================================================
 */
/**
 * Busca dados analíticos. 
 * [ATUALIZADO] Aceita studentId opcional para o modo Coach.
 */
export const fetchExerciseAnalytics = async (
  definitionId: string,
  studentId?: string // <--- Parâmetro Novo
): Promise<ExerciseAnalyticsData> => {
  if (!definitionId) {
    throw new Error('ID da Definição é necessário.');
  }

  try {
    const { data, error } = await supabase.rpc('get_exercise_analytics', {
      p_definition_id: definitionId,
      p_target_user_id: studentId || null // <--- Passa para o SQL
    });

    if (error) {
      console.error('Erro analytics:', error.message);
      throw new Error(error.message);
    }

    return data as ExerciseAnalyticsData;
  } catch (err) {
    console.error('Erro fetchExerciseAnalytics:', err);
    // Retorno fallback vazio
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