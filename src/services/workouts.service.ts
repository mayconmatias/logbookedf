import { supabase } from '@/lib/supabaseClient';
import { WorkoutExercise } from '@/types/workout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalYYYYMMDD } from '@/utils/date';

// Importações necessárias para copiar os exercícios
import { fetchPlannedExercises } from '@/services/workout_planning.service';
import { instantiateTemplateInWorkout } from '@/services/exercises.service';

const SESSION_KEY = '@sessionWorkoutId';

/**
 * Busca ou cria uma sessão para HOJE.
 * [ATUALIZADO] Agora instancia os exercícios se for um treino novo vindo de um Programa.
 */
export const getOrCreateTodayWorkoutId = async (originId?: string): Promise<string> => {
  const today = getLocalYYYYMMDD();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não encontrado');

  // 1. Define se é Template ou PlannedWorkout
  let templateColumn = null;
  let plannedColumn = null;

  if (originId) {
    // Verifica se o ID passado é de um 'planned_workout' (Programa)
    const { data: isPlanned } = await supabase
      .from('planned_workouts')
      .select('id')
      .eq('id', originId)
      .maybeSingle();

    if (isPlanned) {
      plannedColumn = originId;
    } else {
      // Caso contrário, assume que é um template legado ou salvo pelo usuário
      templateColumn = originId;
    }
  }

  // 2. Busca se já existe sessão ABERTA HOJE para este mesmo treino
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
    // Treino Livre (sem origem definida)
    query = query.is('template_id', null).is('planned_workout_id', null);
  }

  const { data: existingWorkout, error: findError } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  
  // SE JÁ EXISTE UMA SESSÃO ABERTA, RETORNA ELA (Não duplica exercícios)
  if (existingWorkout) {
    await AsyncStorage.setItem(SESSION_KEY, existingWorkout.id);
    return existingWorkout.id;
  }

  // 3. Cria novo treino se não achou sessão ABERTA
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

  // 4. [CORREÇÃO CRÍTICA] Se veio de um Programa, COPIAR os exercícios agora!
  if (plannedColumn) {
    try {
      // Busca os exercícios planejados
      const plannedExercises = await fetchPlannedExercises(plannedColumn);
      
      // Instancia eles dentro do treino recém-criado (Copia Definição + Séries/Reps/RPE alvo)
      await instantiateTemplateInWorkout(newWorkout.id, plannedExercises);
      
    } catch (e) {
      console.error("Erro ao instanciar exercícios do programa:", e);
      // Não damos throw aqui para não travar a abertura da tela, 
      // mas o usuário verá um treino vazio se isso falhar.
    }
  }

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

/**
 * Busca os dias (índices 0-6) em que houve treino na semana atual.
 * Usado para o WeeklyTracker da Home.
 */
export const fetchThisWeekWorkoutDays = async (): Promise<number[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // [CORREÇÃO] Cálculo manual das datas locais para evitar UTC shift
  const curr = new Date();
  const currentDayIndex = curr.getDay(); // 0 (Dom) a 6 (Sáb)
  
  // Encontra o Domingo (Início da Semana)
  const startOfWeek = new Date(curr);
  startOfWeek.setDate(curr.getDate() - currentDayIndex);

  // Encontra o Sábado (Fim da Semana)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  // Helper para formatar YYYY-MM-DD localmente
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

  // Converte as datas string 'YYYY-MM-DD' para o índice do dia da semana
  const days = data.map(row => {
    const [y, m, d] = row.workout_date.split('-').map(Number);
    // Cria a data localmente usando o construtor (mês é base 0)
    const localDate = new Date(y, m - 1, d); 
    return localDate.getDay();
  });

  // Remove duplicatas
  return [...new Set(days)];
};