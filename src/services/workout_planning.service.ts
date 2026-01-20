import { supabase } from '@/lib/supabaseClient';
import { PlannedWorkout, PlannedExercise } from '@/types/coaching';
import { SetType } from '@/types/workout';

// ============================================================
// 1. GERENCIAMENTO DE DIAS DE TREINO (Planned Workouts)
// ============================================================

export const fetchPlannedWorkouts = async (programId: string): Promise<PlannedWorkout[]> => {
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('program_id', programId)
    .order('day_order', { ascending: true });

  if (error) throw error;
  return data || [];
};

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

export const deletePlannedWorkout = async (workoutId: string) => {
  const { error } = await supabase
    .from('planned_workouts')
    .delete()
    .eq('id', workoutId);

  if (error) throw error;
};

export const renamePlannedWorkout = async (workoutId: string, newName: string) => {
  const { error } = await supabase
    .from('planned_workouts')
    .update({ name: newName.trim() })
    .eq('id', workoutId);

  if (error) throw error;
};

// ============================================================
// 2. GERENCIAMENTO DE EXERCÍCIOS (Planned Exercises)
// ============================================================

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

export const addPlannedExercise = async (
  plannedWorkoutId: string,
  definitionId: string,
  orderIndex: number,
  overrides?: {
    sets?: number;
    reps?: string;
    rpe?: string;
    notes?: string;
    set_type?: SetType; // [NOVO]
  }
) => {
  // 1. Buscar nota padrão do catálogo
  const { data: defData } = await supabase
    .from('exercise_definitions')
    .select('default_notes')
    .eq('id', definitionId)
    .single();

  const notesToInsert = overrides?.notes || defData?.default_notes || null;

  // 2. Inserir com os valores
  const { error } = await supabase
    .from('planned_exercises')
    .insert({
      planned_workout_id: plannedWorkoutId,
      definition_id: definitionId,
      order_index: orderIndex,
      sets_count: overrides?.sets ?? 3,
      reps_range: overrides?.reps || '8-12',
      rpe_target: overrides?.rpe || '8',
      notes: notesToInsert,
      set_type: overrides?.set_type || 'normal' // [NOVO] Default para 'normal'
    });

  if (error) throw error;
};

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

export const deletePlannedExercise = async (exerciseId: string) => {
  const { error } = await supabase
    .from('planned_exercises')
    .delete()
    .eq('id', exerciseId);

  if (error) throw error;
};

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

export const fetchStudentActivePlan = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data: program, error: progError } = await supabase
    .from('programs')
    .select('*')
    .eq('student_id', user.id)
    .eq('is_active', true)
    .single();

  if (progError && progError.code !== 'PGRST116') throw progError; 
  if (!program) return null;

  const { data: workouts, error: workError } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('program_id', program.id)
    .order('day_order', { ascending: true });

  if (workError) throw workError;

  return { program, workouts: workouts || [] };
};