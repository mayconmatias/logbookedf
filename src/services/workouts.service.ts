import { supabase } from '@/lib/supabaseClient';
import { WorkoutExercise } from '@/types/workout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalYYYYMMDD } from '@/utils/date';

import { fetchPlannedExercises } from '@/services/workout_planning.service';
import { instantiateTemplateInWorkout } from '@/services/exercises.service';

const SESSION_KEY = '@sessionWorkoutId';

/**
 * Busca ou cria uma sessão para HOJE.
 */
export const getOrCreateTodayWorkoutId = async (originId?: string): Promise<string> => {
  const today = getLocalYYYYMMDD();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não encontrado');

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

  let query = supabase
    .from('workouts')
    .select('id')
    .eq('user_id', user.id)
    .eq('workout_date', today)
    .is('ended_at', null); 

  if (plannedColumn) {
    query = query.eq('planned_workout_id', plannedColumn);
  } else if (templateColumn) {
    query = query.eq('template_id', templateColumn);
  } else {
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

  const { data: newWorkout, error: createError } = await supabase
    .from('workouts')
    .insert({
      user_id: user.id,
      workout_date: today,
      template_id: templateColumn,
      planned_workout_id: plannedColumn,
    })
    .select('id')
    .single();

  if (createError) throw createError;

  if (plannedColumn) {
    try {
      const plannedExercises = await fetchPlannedExercises(plannedColumn);
      await instantiateTemplateInWorkout(newWorkout.id, plannedExercises);
    } catch (e) {
      console.error("Erro ao instanciar exercícios do programa:", e);
    }
  }

  await AsyncStorage.setItem(SESSION_KEY, newWorkout.id);
  return newWorkout.id;
};

/**
 * [ATUALIZADO] Busca dados agrupados e aplica ordenação rigorosa no JS.
 * CORREÇÃO: Removemos 'created_at' da query de 'sets' pois a tabela usa 'performed_at'.
 */
export const fetchAndGroupWorkoutData = async (
  currentWorkoutId: string
): Promise<WorkoutExercise[]> => {
  
  const { data, error } = await supabase
    .from('exercises')
    .select(`
      id,
      definition_id,
      notes,
      video_url,
      is_unilateral,
      order_in_workout,
      created_at,
      substituted_by_id,    
      is_substitution,      
      original_exercise_id, 
      definition:exercise_definitions (
        name
      ),
      sets (
        id,
        exercise_id,
        set_number,
        weight,
        reps,
        rpe,
        observations,
        side,
        performed_at,
        set_type,
        parent_set_id
      )
    `)
    .eq('workout_id', currentWorkoutId)
    .order('order_in_workout', { ascending: true });

  if (error) {
    console.error("Erro ao buscar dados do treino:", error.message);
    throw error;
  }

  const exercises: WorkoutExercise[] = (data || []).map((ex: any) => {
    // [CORREÇÃO BUG 3] Ordenação Rigorosa
    const sortedSets = (ex.sets || []).sort((a: any, b: any) => {
      // 1. Aquecimento SEMPRE no topo
      const aIsWarmup = a.set_type === 'warmup';
      const bIsWarmup = b.set_type === 'warmup';
      
      if (aIsWarmup && !bIsWarmup) return -1;
      if (!aIsWarmup && bIsWarmup) return 1;

      // 2. Número da Série (Principal)
      if (a.set_number !== b.set_number) {
        return a.set_number - b.set_number;
      }

      // 3. Cronologia (Desempate vital para Unilaterais)
      // Como 'performed_at' tem default NOW() no banco, ele serve como created_at
      const timeA = new Date(a.performed_at).getTime();
      const timeB = new Date(b.performed_at).getTime();
      return timeA - timeB;
    });

    return {
      id: ex.id,
      definition_id: ex.definition_id,
      name: ex.definition?.name || 'Exercício',
      notes: ex.notes,
      video_url: ex.video_url,
      is_unilateral: ex.is_unilateral,
      order_in_workout: ex.order_in_workout,
      substituted_by_id: ex.substituted_by_id,
      is_substitution: ex.is_substitution,
      original_exercise_id: ex.original_exercise_id,
      sets: sortedSets
    };
  });

  return exercises;
};

export const finishWorkoutSession = async (
  sessionWorkoutId: string,
  hasSavedSets: boolean
): Promise<void> => {
  await AsyncStorage.removeItem(SESSION_KEY);

  if (!sessionWorkoutId) return;

  if (!hasSavedSets) {
    try {
      await supabase.from('workouts').delete().eq('id', sessionWorkoutId);
    } catch (e: any) {
      console.error('Erro ao deletar sessão vazia:', e.message);
    }
  } else {
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

export const fetchCurrentOpenSession = async () => {
  const today = getLocalYYYYMMDD();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('workouts')
    .select('id, template_id, planned_workout_id') 
    .eq('user_id', user.id)
    .eq('workout_date', today)
    .is('ended_at', null) 
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar sessão aberta:', error);
    return null;
  }

  return data; 
};

export const fetchThisWeekWorkoutDays = async (): Promise<number[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const curr = new Date();
  const currentDayIndex = curr.getDay(); 
  
  const startOfWeek = new Date(curr);
  startOfWeek.setDate(curr.getDate() - currentDayIndex);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const formatLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const firstDayStr = formatLocal(startOfWeek);
  const lastDayStr = formatLocal(endOfWeek);

  const { data, error } = await supabase
    .from('workouts')
    .select('workout_date')
    .eq('user_id', user.id)
    .gte('workout_date', firstDayStr)
    .lte('workout_date', lastDayStr);

  if (error) {
    console.error("Erro ao buscar frequência:", error);
    return [];
  }

  const days = data.map(row => {
    const [y, m, d] = row.workout_date.split('-').map(Number);
    const localDate = new Date(y, m - 1, d); 
    return localDate.getDay();
  });

  return [...new Set(days)];
};

export const sanitizeOpenSessions = async () => {
  const { error } = await supabase.rpc('sanitize_stale_workouts');
  if (error) {
    console.error('Erro ao sanitizar sessões antigas:', error.message);
  }
};