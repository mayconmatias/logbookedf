import { useState, useEffect, useCallback } from 'react';
import {
  getOrCreateTodayWorkoutId,
  fetchAndGroupWorkoutData,
  finishWorkoutSession,
} from '@/services/workouts.service';
import { WorkoutExercise } from '@/types/workout';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabaseClient';

export const useWorkoutSession = (
  paramWorkoutId?: string,
  paramTemplateId?: string 
) => {
  const [sessionWorkoutId, setSessionWorkoutId] = useState<string | null>(null);
  const [groupedWorkout, setGroupedWorkout] = useState<WorkoutExercise[]>([]);
  const [loading, setLoading] = useState(true);
  
  // [NOVO] Flag para identificar se é treino estruturado
  const [isProgram, setIsProgram] = useState(false);

  const initializeSession = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      let data: WorkoutExercise[] = [];
      let workoutId: string | null = null;

      if (paramWorkoutId) {
        workoutId = paramWorkoutId;
      } else {
        workoutId = await getOrCreateTodayWorkoutId(paramTemplateId);
      }

      // 1. Busca dados agrupados (Exercícios e Séries)
      data = await fetchAndGroupWorkoutData(workoutId);

      // 2. [NOVO] Verifica se é Programa/Template
      if (workoutId) {
        const { data: wInfo } = await supabase
          .from('workouts')
          .select('template_id, planned_workout_id')
          .eq('id', workoutId)
          .single();
        
        // Se tiver ID de template ou programa, é estruturado. Se não, é Livre.
        if (wInfo && (wInfo.template_id || wInfo.planned_workout_id)) {
            setIsProgram(true);
        } else {
            setIsProgram(false);
        }
      }

      if (!signal.aborted) {
        setGroupedWorkout(data);
        setSessionWorkoutId(workoutId);
      }
    } catch (e: any) {
      if (!signal.aborted) {
        Alert.alert('Erro ao carregar sessão', e.message);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [paramWorkoutId, paramTemplateId]);

  useEffect(() => {
    const controller = new AbortController();
    initializeSession(controller.signal);
    return () => {
      controller.abort();
    };
  }, [initializeSession]);

  const finishWorkout = useCallback(async () => {
    if (!sessionWorkoutId) return;
    const hasSavedSets = groupedWorkout.some((ex) => ex.sets.length > 0);
    
    if (!paramWorkoutId) {
      await finishWorkoutSession(sessionWorkoutId, hasSavedSets);
    }
  }, [sessionWorkoutId, groupedWorkout, paramWorkoutId]);

  return {
    loading,
    sessionWorkoutId,
    groupedWorkout,
    setGroupedWorkout,
    finishWorkout,
    isProgram, // Exportando a flag
  };
};