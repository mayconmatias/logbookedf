import { useState, useCallback } from 'react';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';
import { ChartDataPoint } from '@/types/analytics';
import { getProgressionData } from '@/services/progression.service';

const calculateSessionTEV = (
  groupedWorkout: WorkoutExercise[],
  definitionId: string
): number => {
  const exercise = groupedWorkout.find(
    (ex) => ex.definition_id === definitionId
  );
  if (!exercise) return 0;

  return exercise.sets.reduce((sum, set) => {
    // [NOVO] Ignora aquecimento no cálculo local
    if (set.set_type === 'warmup') return sum;
    
    return sum + (set.weight || 0) * (set.reps || 0);
  }, 0);
};

export const useShareFlows = (groupedWorkout: WorkoutExercise[]) => {
  const [isSetShareModalVisible, setIsSetShareModalVisible] = useState(false);
  const [isProgressionShareModalVisible, setIsProgressionShareModalVisible] =
    useState(false);

  const [setToshare, setSetToShare] = useState<WorkoutSet | null>(null);

  const [isSharingPR, setIsSharingPR] = useState(false);
  const [exerciseNameToShare, setExerciseNameToShare] = useState('');

  const [progressionDataForModal, setProgressionDataForModal] =
    useState<ChartDataPoint[] | null>(null);
  const [currentSessionTEV, setCurrentSessionTEV] = useState(0);

  const [isFetchingShareData, setIsFetchingShareData] = useState(false);

  // --- Modal de Série (PR ou normal) ---
  const handleOpenSetShareModal = useCallback(
    (set: WorkoutSet, isPR: boolean, exerciseName: string, sessionWorkoutId: string | null) => {
      setSetToShare({ 
        ...set, 
        sessionWorkoutId: sessionWorkoutId || undefined 
      });
      setIsSharingPR(isPR);
      setExerciseNameToShare(exerciseName);
      setIsSetShareModalVisible(true);
    },
    []
  );

  const handleCloseSetShareModal = useCallback(() => {
    setIsSetShareModalVisible(false);
  }, []);

  // --- Modal de Progressão ---
  const handleOpenProgressionShareModal = useCallback(
    async (set: WorkoutSet, exerciseName: string, definitionId: string) => {
      setSetToShare(set);
      setExerciseNameToShare(exerciseName);
      setIsProgressionShareModalVisible(true);

      setProgressionDataForModal(null);
      setCurrentSessionTEV(0);

      if (!definitionId) {
        console.error('Modal de progressão aberto sem definitionId!');
        return;
      }

      try {
        setIsFetchingShareData(true);

        const progressionData = await getProgressionData(definitionId);
        setProgressionDataForModal(progressionData);

        const tev = calculateSessionTEV(groupedWorkout, definitionId);
        setCurrentSessionTEV(tev);
      } catch (e) {
        console.error('Erro ao buscar dados de progressão:', e);
        setProgressionDataForModal([]);
      } finally {
        setIsFetchingShareData(false);
      }
    },
    [groupedWorkout]
  );

  const handleCloseProgressionShareModal = useCallback(() => {
    setIsProgressionShareModalVisible(false);
  }, []);

  return {
    isSetShareModalVisible,
    isProgressionShareModalVisible,
    setToshare,
    isSharingPR,
    exerciseNameToShare,
    progressionDataForModal,
    currentSessionTEV,
    isFetchingShareData,
    handleOpenSetShareModal,
    handleCloseSetShareModal,
    handleOpenProgressionShareModal,
    handleCloseProgressionShareModal,
  };
};