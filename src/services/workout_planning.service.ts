import { supabase } from '@/lib/supabaseClient';
import { PlannedWorkout, PlannedExercise } from '@/types/coaching';

// ============================================================
// 1. GERENCIAMENTO DE DIAS DE TREINO (Planned Workouts)
// ============================================================

/**
 * Busca os dias de treino de um programa (ex: Treino A, Treino B)
 */
export const fetchPlannedWorkouts = async (programId: string): Promise<PlannedWorkout[]> => {
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('program_id', programId)
    .order('day_order', { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Cria um novo dia de treino (ex: "Treino C")
 */
export const createPlannedWorkout = async (
  programId: string, 
  name: string, 
  currentCount: number
): Promise<PlannedWorkout> => {
  const { data, error } = await supabase
    .from('planned_workouts')
    .insert({
      program_id: programId,
      name: name.trim(),
      day_order: currentCount,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

/**
 * Deleta um dia de treino
 */
export const deletePlannedWorkout = async (workoutId: string) => {
  const { error } = await supabase
    .from('planned_workouts')
    .delete()
    .eq('id', workoutId);

  if (error) throw error;
};

// ============================================================
// 2. GERENCIAMENTO DE EXERCÍCIOS (Planned Exercises)
// ============================================================

/**
 * Busca os exercícios de um dia de treino específico.
 */
export const fetchPlannedExercises = async (plannedWorkoutId: string): Promise<PlannedExercise[]> => {
  const { data, error } = await supabase
    .from('planned_exercises')
    .select(`
      *,
      definition:exercise_definitions ( name )
    `)
    .eq('planned_workout_id', plannedWorkoutId)
    .order('order_index', { ascending: true });

  if (error) throw error;

  return data.map((item: any) => ({
    ...item,
    definition_name: item.definition?.name || 'Exercício Desconhecido'
  }));
};

/**
 * Adiciona um exercício ao dia de treino.
 */
export const addPlannedExercise = async (
  plannedWorkoutId: string,
  definitionId: string,
  orderIndex: number
) => {
  // 1. Buscar dados do catálogo primeiro (para pegar a nota padrão)
  const { data: defData } = await supabase
    .from('exercise_definitions')
    .select('default_notes')
    .eq('id', definitionId)
    .single();

  const notesToInsert = defData?.default_notes || null;

  // 2. Inserir com a nota pré-preenchida
  const { error } = await supabase
    .from('planned_exercises')
    .insert({
      planned_workout_id: plannedWorkoutId,
      definition_id: definitionId,
      order_index: orderIndex,
      sets_count: 3,
      reps_range: '8-12',
      rpe_target: '8',
      notes: notesToInsert,
    });

  if (error) throw error;
};

/**
 * Atualiza a prescrição (Sets, Reps, RPE, Notas)
 */
export const updatePlannedExercise = async (
  exerciseId: string,
  updates: Partial<PlannedExercise>
) => {
  const { definition, definition_name, id, ...cleanUpdates } = updates as any;

  const { error } = await supabase
    .from('planned_exercises')
    .update(cleanUpdates)
    .eq('id', exerciseId);

  if (error) throw error;
};

/**
 * Remove um exercício.
 */
export const deletePlannedExercise = async (exerciseId: string) => {
  const { error } = await supabase
    .from('planned_exercises')
    .delete()
    .eq('id', exerciseId);

  if (error) throw error;
};

/**
 * Busca o Programa Ativo e seus Treinos para o aluno logado.
 */
export const fetchStudentActivePlan = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  // 1. Busca o programa marcado como 'is_active' para este aluno
  const { data: program, error: progError } = await supabase
    .from('programs')
    .select('*')
    .eq('student_id', user.id)
    .eq('is_active', true)
    .single();

  if (progError && progError.code !== 'PGRST116') {
    throw progError; 
  }

  if (!program) return null;

  // 2. Busca os dias de treino desse programa
  const { data: workouts, error: workError } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('program_id', program.id)
    .order('day_order', { ascending: true });

  if (workError) throw workError;

  return {
    program,
    workouts: workouts || []
  };
};

// [NOVO] Reordena exercícios planejados
export const reorderPlannedExercises = async (
  updates: { id: string; order: number }[]
) => {
  const { error } = await supabase.rpc('reorder_planned_exercises', {
    p_updates: updates,
  });
  
  if (error) {
    throw new Error('Falha ao salvar a nova ordem: ' + error.message);
  }
};