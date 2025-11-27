import { supabase } from '@/lib/supabaseClient';
import { WorkoutExercise } from '@/types/workout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalYYYYMMDD } from '@/utils/date';

const SESSION_KEY = '@sessionWorkoutId';

/**
 * Busca ou cria uma sessão para HOJE.
 * [ATUALIZADO] Agora considera apenas sessões ABERTAS (ended_at IS NULL).
 * Se já houver um treino finalizado hoje, ele cria um NOVO.
 */
export const getOrCreateTodayWorkoutId = async (originId?: string): Promise<string> => {
  const today = getLocalYYYYMMDD();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não encontrado');

  // 1. Define se é Template ou PlannedWorkout
  let templateColumn = null;
  let plannedColumn = null;

  if (originId) {
    const { data: isPlanned } = await supabase
      .from('planned_workouts')
      .select('id')
      .eq('id', originId)
      .maybeSingle();

    if (isPlanned) {
      plannedColumn = originId;
    } else {
      templateColumn = originId;
    }
  }

  // 2. Busca se já existe sessão ABERTA HOJE
  let query = supabase
    .from('workouts')
    .select('id')
    .eq('user_id', user.id)
    .eq('workout_date', today)
    .is('ended_at', null); // [IMPORTANTE] Só pega se NÃO estiver finalizado

  if (plannedColumn) {
    query = query.eq('planned_workout_id', plannedColumn);
  } else if (templateColumn) {
    query = query.eq('template_id', templateColumn);
  } else {
    // Treino Livre
    query = query.is('template_id', null).is('planned_workout_id', null);
  }

  const { data: existingWorkout, error: findError } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  
  if (existingWorkout) {
    await AsyncStorage.setItem(SESSION_KEY, existingWorkout.id);
    return existingWorkout.id;
  }

  // 3. Cria novo se não achou sessão ABERTA
  const { data: newWorkout, error: createError } = await supabase
    .from('workouts')
    .insert({
      user_id: user.id,
      workout_date: today,
      template_id: templateColumn,
      planned_workout_id: plannedColumn,
      // ended_at começa nulo por padrão
    })
    .select('id')
    .single();

  if (createError) throw createError;

  await AsyncStorage.setItem(SESSION_KEY, newWorkout.id);
  return newWorkout.id;
};

export const fetchAndGroupWorkoutData = async (
  currentWorkoutId: string
): Promise<WorkoutExercise[]> => {
  const { data, error } = await supabase.rpc('get_workout_data_grouped', {
    p_workout_id: currentWorkoutId,
  });

  if (error) {
    console.error("Erro ao buscar dados do treino:", error.message);
    throw error;
  }
  const exercises = (data as WorkoutExercise[]).map(ex => ({
    ...ex,
    sets: ex.sets || [],
  }));
  return exercises;
};

/**
 * [ATUALIZADO] Finaliza a sessão marcando ended_at.
 */
export const finishWorkoutSession = async (
  sessionWorkoutId: string,
  hasSavedSets: boolean
): Promise<void> => {
  await AsyncStorage.removeItem(SESSION_KEY);

  if (!sessionWorkoutId) return;

  if (!hasSavedSets) {
    // Se não tem séries, deleta o treino lixo
    try {
      await supabase.from('workouts').delete().eq('id', sessionWorkoutId);
    } catch (e: any) {
      console.error('Erro ao deletar sessão vazia:', e.message);
    }
  } else {
    // [IMPORTANTE] Se tem séries, marca como FINALIZADO
    try {
      await supabase
        .from('workouts')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionWorkoutId);
    } catch (e: any) {
      console.error('Erro ao finalizar sessão:', e.message);
    }
  }
};

// [ATUALIZADO] Busca apenas sessão ABERTA para a Home
export const fetchCurrentOpenSession = async () => {
  const today = getLocalYYYYMMDD();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('workouts')
    .select('id, template_id, planned_workout_id') 
    .eq('user_id', user.id)
    .eq('workout_date', today)
    .is('ended_at', null) // [IMPORTANTE] Ignora os finalizados
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar sessão aberta:', error);
    return null;
  }

  return data; 
};