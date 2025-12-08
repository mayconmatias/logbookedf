import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDebounce } from 'use-debounce';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';

import { useWorkoutForm } from './useWorkoutForm';
import { useWorkoutSession } from './useWorkoutSession';
import { useExerciseCatalog } from './useExerciseCatalog';
import { usePerformancePeek } from './usePerformancePeek';
import { useTimer } from '@/context/TimerContext';
import { triggerHaptic } from '@/utils/haptics';

import { 
  getOrCreateExerciseInWorkout, saveSet, updateSet, deleteSet, deleteExercise
} from '@/services/exercises.service';
import { fetchAndGroupWorkoutData } from '@/services/workouts.service';
import { classifyPR } from '@/services/records.service';
import { LBS_TO_KG_FACTOR } from '@/utils/e1rm';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';

const DRAFT_KEY = '@log_workout_draft_v3';

export const useLogWorkoutController = (params: { workoutId?: string; templateId?: string }, navigation: any) => {
  const { t } = useTranslation();
  const form = useWorkoutForm();
  
  const session = useWorkoutSession(params.workoutId, params.templateId);
  const catalog = useExerciseCatalog();
  const performance = usePerformancePeek();
  const timer = useTimer();

  const [saving, setSaving] = useState(false);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  const [isAutocompleteFocused, setIsAutocompleteFocused] = useState(false);

  const [debouncedName] = useDebounce(form.values.exerciseName, 500);
  const isFirstLoad = useRef(true);

  // --- 1. Resolução de IDs de Exercício (Autocomplete) ---
  useEffect(() => {
    if (!debouncedName) return;
    const found = catalog.allExercises.find(
      ex => ex.exercise_name_lowercase === debouncedName.toLowerCase().trim()
    );
    
    if (found) {
      if (form.values.definitionIdA !== found.exercise_id) {
        form.setters.setDefinitionIdA(found.exercise_id);
        performance.fetchQuickStats(found.exercise_id);
      }
    } else {
      if (!form.values.editingSetId) {
        form.setters.setDefinitionIdA(null);
        performance.clearPeek();
      }
    }
  }, [debouncedName, catalog.allExercises]);

  // --- 2. Draft Auto-Save ---
  useEffect(() => {
    const saveDraft = async () => {
      if (!session.sessionWorkoutId) return;
      const draftData = {
        sessionId: session.sessionWorkoutId,
        values: form.values,
        timestamp: Date.now()
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    };
    if (!session.loading && form.values.exerciseName) {
      saveDraft();
    }
  }, [form.values, session.sessionWorkoutId]);

  useEffect(() => {
    const restoreDraft = async () => {
      if (!isFirstLoad.current || !session.sessionWorkoutId) return;
      try {
        const draftJson = await AsyncStorage.getItem(DRAFT_KEY);
        if (draftJson) {
          const draft = JSON.parse(draftJson);
          const isRecent = (Date.now() - draft.timestamp) < 24 * 60 * 60 * 1000;
          
          if (draft.sessionId === session.sessionWorkoutId && isRecent) {
             form.setters.setExerciseName(draft.values.exerciseName || '');
             form.setters.setWeight(draft.values.weight || '');
             form.setters.setReps(draft.values.reps || '');
             form.setters.setRpe(draft.values.rpe || '');
             form.setters.setDefinitionIdA(draft.values.definitionIdA || null);
             if(draft.values.definitionIdA) performance.fetchQuickStats(draft.values.definitionIdA);
          }
        }
      } catch (e) { console.log('Erro draft', e); }
      isFirstLoad.current = false;
    };
    
    if (session.sessionWorkoutId && !session.loading) {
       restoreDraft();
       
       if (session.groupedWorkout.length > 0 && !form.values.exerciseName) {
           const firstEx = session.groupedWorkout[0];
           const firstSet = firstEx.sets.find(s => s.weight === 0 && s.reps === 0);
           if (firstSet) {
              prepareFormForNextSet(firstEx, firstSet);
           }
       }
    }
  }, [session.sessionWorkoutId, session.loading]);

  const prepareFormForNextSet = (exercise: WorkoutExercise, set: WorkoutSet) => {
    form.setters.setExerciseName(exercise.name);
    form.setters.setDefinitionIdA(exercise.definition_id);
    form.setters.setWeight(''); 
    form.setters.setReps(''); 
    form.setters.setRpe(set.rpe ? set.rpe.toString() : '');
    form.setters.setActiveSetType(set.set_type);
    performance.fetchQuickStats(exercise.definition_id);
  };

  // --- 3. Lógica de Salvar Série ---
  const handleSaveSet = useCallback(async () => {
    if (!form.values.exerciseName || !form.values.weight || !form.values.reps) {
      toast(t('logWorkout.formValidation')); 
      return;
    }
    let savedSetId: string | null = null; // Variável para capturar ID da nova série
    setSaving(true);
    Keyboard.dismiss();

    try {
      const wA = parseFloat(form.values.weight.replace(',', '.'));
      const wKg = form.values.inputUnit === 'lbs' ? wA * LBS_TO_KG_FACTOR : wA;
      
      const rpeValue = form.values.rpe 
        ? parseFloat(form.values.rpe.replace(',', '.')) 
        : undefined;

      const ensureDef = async (name: string, currentId: string | null) => {
        if (currentId) return currentId;
        const newDef = await catalog.handleCreateExercise(name, { silent: true });
        return newDef?.exercise_id || null;
      };

      const defIdA = await ensureDef(form.values.exerciseName, form.values.definitionIdA);
      if (!defIdA) throw new Error('Erro ao identificar exercício.');

      const exInstanceId = await getOrCreateExerciseInWorkout(session.sessionWorkoutId!, defIdA);

      const commonData = {
        weight: wKg,
        reps: parseInt(form.values.reps),
        rpe: rpeValue,
        observations: form.values.observations || undefined,
        side: form.values.isUnilateral ? form.values.side : undefined,
        set_type: form.values.activeSetType,
        // Incluindo subsets
        subSets: form.values.subSets.map(s => ({
          weight: parseFloat(s.weight), reps: parseInt(s.reps)
        }))
      };

      // LOGICA DE AQUECIMENTO E EDIÇÃO
      let targetEditingId = form.values.editingSetId;
      const isWarmup = form.values.activeSetType === 'warmup';

      if (targetEditingId) {
        const originalSet = session.groupedWorkout
            .flatMap(ex => ex.sets)
            .find(s => s.id === targetEditingId);

        if (isWarmup) {
            if (originalSet && originalSet.set_type !== 'warmup') {
                targetEditingId = null;
            }
        }
      }

      if (targetEditingId) {
        // EDIÇÃO
        await updateSet(targetEditingId, commonData as any);
        savedSetId = targetEditingId; // <--- CAPTURA ID
        toast.success('Série atualizada');
        form.setters.setEditingSetId(null);
        form.actions.clearForm();

      } else {
        // NOVA/PLANO
        const currentExerciseData = session.groupedWorkout.find(e => e.id === exInstanceId);
        
        const pendingSet = !isWarmup 
            ? currentExerciseData?.sets.find(s => s.weight === 0 && s.reps === 0)
            : null;

        if (pendingSet) {
           const updated = await updateSet(pendingSet.id, {
             ...commonData,
             performed_at: new Date().toISOString()
           } as any);
           savedSetId = updated.id; // <--- CAPTURA ID
        } else {
           const nextNum = currentExerciseData ? currentExerciseData.sets.length + 1 : 1;
           const created = await saveSet({
             exercise_id: exInstanceId,
             set_number: isWarmup ? 0 : nextNum,
             ...commonData
           });
           savedSetId = created.id; // <--- CAPTURA ID
        }

        if (!isWarmup && savedSetId) {
           const pr = classifyPR(wKg, parseInt(form.values.reps), performance.exerciseStats);
           if (pr.isPR) {
              triggerHaptic('success');
              toast.success(`NOVO RECORDE: ${pr.diffLabel}`);
              setPrSetIds(prev => new Set(prev).add(savedSetId!)); // <--- USA O ID CAPTURADO
           }
        }
      }

      const updatedWorkout = await fetchAndGroupWorkoutData(session.sessionWorkoutId!);
      session.setGroupedWorkout(updatedWorkout);
      await AsyncStorage.removeItem(DRAFT_KEY);

      if (!targetEditingId) {
         handleAutoAdvance(updatedWorkout, exInstanceId);
      }

    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
}, [form.values, session.sessionWorkoutId, performance.exerciseStats]);

  // --- Lógica de Avanço (CORRIGIDA) ---
  const handleAutoAdvance = (workoutData: WorkoutExercise[], currentExInstanceId: string) => {
     // [CORREÇÃO] Se for treino LIVRE, não faz nada além de confirmar
     if (!session.isProgram) {
        return; 
     }

     const currentExIndex = workoutData.findIndex(e => e.id === currentExInstanceId);
     const currentEx = workoutData[currentExIndex];
     
     if (!currentEx) return;

     const nextPendingSet = currentEx.sets.find(s => s.weight === 0 && s.reps === 0);

     if (nextPendingSet) {
        form.setters.setWeight(''); 
        form.setters.setReps('');
        form.setters.setRpe('');
        toast(`Próxima série: #${nextPendingSet.set_number}`);
     } else {
        const nextExercise = workoutData[currentExIndex + 1];

        if (nextExercise) {
           Alert.alert(
             'Exercício Finalizado',
             `Deseja ir para o próximo: "${nextExercise.name}"?`,
             [
               { text: 'Não, fazer mais uma', style: 'cancel', onPress: () => {} },
               { text: 'Sim, Avançar', onPress: () => {
                  form.setters.setExerciseName(nextExercise.name);
                  form.setters.setDefinitionIdA(nextExercise.definition_id);
                  form.actions.clearForm();
                  performance.fetchQuickStats(nextExercise.definition_id);
                  
                  const nextFirstSet = nextExercise.sets.find(s => s.weight === 0);
                  if (nextFirstSet) {
                    form.setters.setActiveSetType('normal'); 
                  }
               }}
             ]
           );
        } else {
           Alert.alert(
             'Treino Concluído!',
             'Todas as séries planejadas foram realizadas.',
             [
                { text: 'Adicionar Extra', style: 'cancel' },
                { text: 'Finalizar Treino', onPress: handleFinish }
             ]
           );
        }
     }
  };

  const handleEditSet = useCallback((set: WorkoutSet) => {
    requestAnimationFrame(() => {
        form.setters.setEditingSetId(set.id);
        
        const parentExercise = session.groupedWorkout.find(e => e.id === set.exercise_id);
        if (parentExercise) {
           form.setters.setExerciseName(parentExercise.name);
           form.setters.setDefinitionIdA(parentExercise.definition_id);
           performance.fetchQuickStats(parentExercise.definition_id);
        }

        form.setters.setWeight(set.weight.toString());
        form.setters.setReps(set.reps.toString());
        form.setters.setRpe(set.rpe ? set.rpe.toString() : '');
        form.setters.setObservations(set.observations || '');
        form.setters.setActiveSetType(set.set_type);
        
        if (set.side) {
            form.setters.setIsUnilateral(true);
            form.setters.setSide(set.side);
        } else {
            form.setters.setIsUnilateral(false);
            form.setters.setSide(null);
        }
        
        toast('Editando série...');
    });
  }, [session.groupedWorkout, form.setters, performance]);

  const handleDeleteSet = async (setId: string, exId: string, defId: string) => {
     Alert.alert('Apagar', 'Remover esta série?', [
       { text: 'Cancelar', style: 'cancel'},
       { text: 'Apagar', style: 'destructive', onPress: async () => {
          await deleteSet(setId);
          const updated = await fetchAndGroupWorkoutData(session.sessionWorkoutId!);
          session.setGroupedWorkout(updated);
       }}
     ]);
  };

  const handleClearExerciseName = useCallback(() => {
    form.setters.setExerciseName('');
    form.setters.setDefinitionIdA(null);
    form.actions.clearForm(); 
    performance.clearPeek();
    setIsAutocompleteFocused(false);
  }, [form.setters, form.actions, performance]);

  const handleFinish = async () => {
    Alert.alert(
      t('logWorkout.workoutFinishedTitle'),
      t('logWorkout.workoutFinishedBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('logWorkout.finishWorkoutButton'), 
          onPress: async () => {
            setSaving(true);
            try {
              await session.finishWorkout(); 
              await AsyncStorage.removeItem(DRAFT_KEY);
              navigation.reset({ index: 0, routes: [{ name: 'WorkoutHistory' }] });
            } catch (error) {
              toast.error('Erro ao finalizar');
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };
  
  return {
    form, session, catalog, performance,
    saving, prSetIds, isAutocompleteFocused, setIsAutocompleteFocused,
    handleSaveSet, handleEditSet, handleDeleteSet, handleFinish, handleClearExerciseName, timer
  };
};