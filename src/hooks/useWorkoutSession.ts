import { useState, useEffect, useCallback } from 'react';
import {
  getOrCreateTodayWorkoutId,
  fetchAndGroupWorkoutData,
  finishWorkoutSession,
} from '@/services/workouts.service';
import { WorkoutExercise } from '@/types/workout';
import { Alert } from 'react-native';

export const useWorkoutSession = (
  paramWorkoutId?: string,
  paramTemplateId?: string 
) => {
  const [sessionWorkoutId, setSessionWorkoutId] = useState<string | null>(null);
  const [groupedWorkout, setGroupedWorkout] = useState<WorkoutExercise[]>([]);
  const [loading, setLoading] = useState(true);

  const initializeSession = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      let data: WorkoutExercise[] = [];
      let workoutId: string | null = null;

      if (paramWorkoutId) {
        workoutId = paramWorkoutId;
        data = await fetchAndGroupWorkoutData(workoutId);
      } else {
        workoutId = await getOrCreateTodayWorkoutId(paramTemplateId);
        data = await fetchAndGroupWorkoutData(workoutId);
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
  };
};