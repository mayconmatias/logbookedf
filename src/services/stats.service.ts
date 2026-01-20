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

export interface MuscleProgressItem {
  muscle_group: string;
  signal: 'progress' | 'stagnation' | 'regression' | 'insufficient_data';
  weeks_count: number;
  reps_delta_pct: number;
  vtt_delta_pct: number;
  avg_reps_end: number; // [NOVO]
  avg_vtt_end: number;  // [NOVO]
}

export interface StudentProgressReport {
  window_weeks: number;
  muscle_summary: MuscleProgressItem[];
}

export const fetchStudentProgressReport = async (
  studentId: string, 
  weeksOverride?: number // [NOVO]
): Promise<StudentProgressReport | null> => {
  const { data, error } = await supabase.rpc('get_student_progress_report', {
    p_student_id: studentId,
    p_override_weeks: weeksOverride || null
  });

  if (error) {
    console.error('Erro ao buscar relatório:', error);
    return null;
  }

  return data as StudentProgressReport;
};