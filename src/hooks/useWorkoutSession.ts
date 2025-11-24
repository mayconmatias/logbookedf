// src/hooks/useWorkoutSession.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getOrCreateTodayWorkoutId,
  fetchAndGroupWorkoutData,
  finishWorkoutSession,
} from '@/services/workouts.service';
import { WorkoutExercise } from '@/types/workout';
import { Alert } from 'react-native';

/**
 * Hook responsável por gerenciar a vida da sessão (abrir, carregar, finalizar).
 * Agora suporta diferenciar entre Treino Livre e Templates.
 */
export const useWorkoutSession = (
  paramWorkoutId?: string,
  paramTemplateId?: string // <--- Recebe o Template ID
) => {
  const [sessionWorkoutId, setSessionWorkoutId] = useState<string | null>(null);
  const [groupedWorkout, setGroupedWorkout] = useState<WorkoutExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  const initializeSession = useCallback(async () => {
    setLoading(true);
    try {
      let data: WorkoutExercise[] = [];
      let workoutId: string | null = null;

      if (paramWorkoutId) {
        // MODO HISTÓRICO/EDIÇÃO: Abre um treino específico passado por parâmetro
        workoutId = paramWorkoutId;
        data = await fetchAndGroupWorkoutData(workoutId);
      } else {
        // MODO SESSÃO DO DIA:
        // Busca ou cria baseado no Template (ou falta dele)
        workoutId = await getOrCreateTodayWorkoutId(paramTemplateId);
        data = await fetchAndGroupWorkoutData(workoutId);
      }

      if (isMounted.current) {
        setGroupedWorkout(data);
        setSessionWorkoutId(workoutId);
      }
    } catch (e: any) {
      if (isMounted.current) {
        Alert.alert('Erro ao carregar sessão', e.message);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [paramWorkoutId, paramTemplateId]); // Reage se o template mudar

  useEffect(() => {
    isMounted.current = true;
    initializeSession();
    return () => {
      isMounted.current = false;
    };
  }, [initializeSession]);

  const finishWorkout = useCallback(async () => {
    if (!sessionWorkoutId) return;
    const hasSavedSets = groupedWorkout.some((ex) => ex.sets.length > 0);
    
    // Se não estamos editando um histórico antigo, finaliza a sessão
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