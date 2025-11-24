// src/services/stats.service.ts
import { supabase } from '@/lib/supabaseClient';
import { ExerciseStats } from '@/types/analytics';

/**
 * Busca as estatísticas agregadas de um exercício específico.
 * Muito mais rápido que calcular na hora.
 */
export const fetchExerciseStats = async (definitionId: string): Promise<ExerciseStats | null> => {
  const { data, error } = await supabase
    .from('exercise_statistics')
    .select('*')
    .eq('definition_id', definitionId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar stats:', error);
    return null;
  }

  return data as ExerciseStats;
};