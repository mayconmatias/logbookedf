import { supabase } from '@/lib/supabaseClient';
import { CatalogExerciseItem } from '@/types/catalog';
import { WorkoutSet, WorkoutExercise, PerformancePeekData } from '@/types/workout';

// =================================================================
// 1. FUNÇÕES DO CATÁLOGO
// =================================================================

export const fetchUniqueExerciseCatalog = async (): Promise<CatalogExerciseItem[]> => {
  const { data, error } = await supabase.rpc('get_unique_exercise_catalog');
  if (error) throw new Error(error.message);
  return data || [];
};

export const createExerciseDefinition = async (name: string) => {
  const { data, error } = await supabase
    .from('exercise_definitions')
    .insert({ name: name.trim() })
    .select('id, name, name_lowercase')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`O exercício "${name.trim()}" já existe.`);
    throw new Error(error.message);
  }
  return data;
};

export const renameExercise = async (definitionId: string, newName: string) => {
  const { error } = await supabase.rpc('rename_exercise_definition', {
    p_definition_id: definitionId,
    p_new_name: newName.trim(),
  });
  if (error) throw new Error(error.message);
};

export const mergeExercises = async (oldDefinitionId: string, targetDefinitionId: string) => {
  const { error } = await supabase.rpc('merge_exercise_definitions', {
    p_old_definition_id: oldDefinitionId,
    p_target_definition_id: targetDefinitionId,
  });
  if (error) throw new Error(error.message);
};

export const deleteExerciseHistory = async (definitionId: string) => {
  const { error } = await supabase.rpc('delete_exercise_definition', {
    p_definition_id: definitionId,
  });
  if (error) throw new Error(error.message);
};

export const updateExerciseInstructions = async (definitionId: string, defaultNotes: string, videoUrl: string) => {
  const { error } = await supabase
    .from('exercise_definitions')
    .update({ default_notes: defaultNotes, video_url: videoUrl })
    .eq('id', definitionId);
  if (error) throw new Error(error.message);
};

// =================================================================
// 2. FUNÇÕES DA SESSÃO
// =================================================================

export const getOrCreateExerciseInWorkout = async (workoutId: string, definitionId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('get_or_create_exercise_in_workout', {
    p_workout_id: workoutId,
    p_definition_id: definitionId,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const fetchExerciseSetHistory = async (definitionId: string) => {
  const { data, error } = await supabase.rpc('get_exercise_set_history', {
    p_definition_id: definitionId,
  });
  if (error) throw new Error(error.message);
  return data || [];
};

// =================================================================
// 3. FUNÇÕES DE SÉRIES (Sets)
// =================================================================

type NewSetData = Omit<WorkoutSet, 'id' | 'created_at' | 'e1rm' | 'performed_at'>;

export const saveSet = async (newSetData: NewSetData): Promise<WorkoutSet> => {
  const { data, error } = await supabase
    .from('sets')
    .insert(newSetData)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

/**
 * [NOVO] Atualiza uma série existente.
 */
export const updateSet = async (setId: string, updates: Partial<WorkoutSet>) => {
  const { data, error } = await supabase
    .from('sets')
    .update(updates)
    .eq('id', setId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteSet = async (setId: string) => {
  const { error } = await supabase.from('sets').delete().eq('id', setId);
  if (error) throw new Error(error.message);
};

export const deleteExercise = async (exerciseInstanceId: string) => {
  const { error } = await supabase.from('exercises').delete().eq('id', exerciseInstanceId);
  if (error) throw new Error(error.message);
};

// =================================================================
// 4. FUNÇÕES DE PERFORMANCE
// =================================================================

export const fetchPerformancePeek = async (definitionId: string, sessionWorkoutId?: string): Promise<PerformancePeekData> => {
  const { data, error } = await supabase.rpc('fetch_performance_peek_by_def_id', {
    p_definition_id: definitionId,
    p_exclude_workout_id: sessionWorkoutId,
  });
  if (error) throw new Error(error.message);
  return data as PerformancePeekData;
};

// =================================================================
// 5. FUNÇÕES DE ORDENAÇÃO
// =================================================================

export const reorderWorkoutExercises = async (
  updates: { id: string; order: number }[]
) => {
  const { error } = await supabase.rpc('reorder_exercises', {
    p_updates: updates,
  });
  
  if (error) {
    throw new Error('Falha ao salvar a nova ordem: ' + error.message);
  }
};