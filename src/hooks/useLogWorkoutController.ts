import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDebounce } from 'use-debounce';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner-native';
import { CommonActions } from '@react-navigation/native';

import { useWorkoutForm } from './useWorkoutForm';
import { useWorkoutSession } from './useWorkoutSession';
import { useExerciseCatalog } from './useExerciseCatalog';
import { usePerformancePeek } from './usePerformancePeek';
import { useTimer } from '@/context/TimerContext';
import { triggerHaptic } from '@/utils/haptics';

import { 
  getOrCreateExerciseInWorkout, 
  saveSet, 
  updateSet, 
  deleteSet, 
  saveSuperSet, 
  deleteExercise,
  substituteExerciseInWorkout 
} from '@/services/exercises.service';
import { fetchAndGroupWorkoutData } from '@/services/workouts.service';
import { supabase } from '@/lib/supabaseClient';
import { sendMessage } from '@/services/feedback.service';

import { LBS_TO_KG_FACTOR } from '@/utils/e1rm'; 
import { WorkoutExercise, WorkoutSet } from '@/types/workout';

const DRAFT_KEY = '@log_workout_draft_v3';

const safeParse = (value: string): number => {
  if (!value) return 0;
  const clean = value.replace(',', '.').replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
};

const safeInt = (value: string): number => {
  if (!value) return 0;
  const clean = value.replace(/[^0-9]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
};

export const useLogWorkoutController = (params: { workoutId?: string; templateId?: string }, navigation: any) => {
  const { t } = useTranslation();
  
  const form = useWorkoutForm();
  const session = useWorkoutSession(params.workoutId, params.templateId);
  const catalog = useExerciseCatalog();
  
  const perfA = usePerformancePeek();
  const perfB = usePerformancePeek();
  const perfC = usePerformancePeek();

  const timer = useTimer();

  const [saving, setSaving] = useState(false);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set()); 
  const [isAutocompleteFocused, setIsAutocompleteFocused] = useState(false);
  
  const hasAutoLoaded = useRef(false);
  const isFirstLoad = useRef(true);

  const [debouncedNameA] = useDebounce(form.values.exerciseName, 500);

  const refreshSessionData = useCallback(async () => {
    if (!session.sessionWorkoutId) return;
    const updated = await fetchAndGroupWorkoutData(session.sessionWorkoutId);
    session.setGroupedWorkout(updated);
    return updated; 
  }, [session.sessionWorkoutId]);

  const loadSetIntoForm = useCallback((
    set: WorkoutSet, 
    exercise?: WorkoutExercise,
    options?: { preserveWeight?: string } 
  ) => {
      if (!exercise) {
          exercise = session.groupedWorkout.find(e => e.id === set.exercise_id);
      }
      if (!exercise) return;

      form.setters.setEditingSetId(set.id);
      
      form.setters.setExerciseName(exercise.name);
      form.setters.setDefinitionIdA(exercise.definition_id);
      perfA.fetchQuickStats(exercise.definition_id);

      if (options?.preserveWeight) {
         form.setters.setWeight(options.preserveWeight);
      } else {
         form.setters.setWeight(set.weight > 0 ? set.weight.toString() : '');
      }

      if (options?.preserveWeight && set.weight === 0 && set.reps === 0) {
         form.setters.setReps(''); 
      } else {
         form.setters.setReps(set.reps > 0 ? set.reps.toString() : '');
      }

      form.setters.setRpe(set.rpe ? set.rpe.toString() : '');
      
      const obsWithE1RM = set.observations || '';
      const pureObs = obsWithE1RM.replace(/\[e1RM:.*?\]/g, '').trim();
      form.setters.setObservations(pureObs);

      form.setters.setActiveSetType(set.set_type);
      
      const isUnilateral = exercise.is_unilateral || !!set.side;
      form.setters.setIsUnilateral(isUnilateral);
      form.setters.setSide(isUnilateral ? (set.side || 'D') : null);

  }, [session.groupedWorkout, form.setters, perfA]);

  useEffect(() => {
    if (!session.isProgram || session.loading || hasAutoLoaded.current || session.groupedWorkout.length === 0) return;

    for (const ex of session.groupedWorkout) {
       if (ex.substituted_by_id) continue;

       const firstEmptySet = [...ex.sets]
          .sort((a, b) => a.set_number - b.set_number)
          .find(s => (s.weight || 0) === 0 && (s.reps || 0) === 0);
       
       if (firstEmptySet) {
          loadSetIntoForm(firstEmptySet, ex);
          hasAutoLoaded.current = true; 
          return; 
       }
    }
  }, [session.loading, session.groupedWorkout, loadSetIntoForm, session.isProgram]);

  useEffect(() => {
    if (!debouncedNameA) return;
    const found = catalog.allExercises.find(ex => ex.exercise_name_lowercase === debouncedNameA.toLowerCase().trim());
    if (found) {
      if (form.values.definitionIdA !== found.exercise_id) {
        form.setters.setDefinitionIdA(found.exercise_id);
        perfA.fetchQuickStats(found.exercise_id);
      }
    } else if (!form.values.editingSetId && !form.values.isSubstitutionMode) {
      form.setters.setDefinitionIdA(null);
      perfA.clearPeek();
      form.setters.setIsTemplateUnilateral(false);
    }
  }, [debouncedNameA, catalog.allExercises, form.values.isSubstitutionMode]);

  useEffect(() => {
    if (!form.values.definitionIdA) {
      form.setters.setIsTemplateUnilateral(false);
      return;
    }
    const activeExerciseA = session.groupedWorkout.find(
      (ex) => ex.definition_id === form.values.definitionIdA
    );
    const isUnilateralFromProgram = activeExerciseA?.is_unilateral || false;
    form.setters.setIsTemplateUnilateral(isUnilateralFromProgram);
  }, [form.values.definitionIdA, session.groupedWorkout, form.setters]);

  useEffect(() => {
    const saveDraft = async () => {
      if (!session.sessionWorkoutId) return;
      const draftData = { sessionId: session.sessionWorkoutId, values: form.values, timestamp: Date.now() };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    };
    if (!session.loading && form.values.exerciseName) saveDraft();
  }, [form.values, session.sessionWorkoutId]);

  useEffect(() => {
    const restoreDraft = async () => {
      if (!isFirstLoad.current || !session.sessionWorkoutId || hasAutoLoaded.current) return; 
      try {
        const draftJson = await AsyncStorage.getItem(DRAFT_KEY);
        if (draftJson) {
          const draft = JSON.parse(draftJson);
          if (draft.sessionId === session.sessionWorkoutId && (Date.now() - draft.timestamp) < 86400000) {
             form.setters.setExerciseName(draft.values.exerciseName || '');
             form.setters.setWeight(draft.values.weight || '');
             form.setters.setReps(draft.values.reps || '');
             form.setters.setRpe(draft.values.rpe || '');
             form.setters.setDefinitionIdA(draft.values.definitionIdA || null);
             if(draft.values.definitionIdA) perfA.fetchQuickStats(draft.values.definitionIdA);
          }
        }
      } catch (e) {}
      isFirstLoad.current = false;
    };
    if (session.sessionWorkoutId && !session.loading) restoreDraft();
  }, [session.sessionWorkoutId, session.loading]);

  const handleFinish = useCallback(async () => {
    Alert.alert(t('logWorkout.workoutFinishedTitle'), t('logWorkout.workoutFinishedBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('logWorkout.finishWorkoutButton'), onPress: async () => {
            setSaving(true);
            try { 
                await session.finishWorkout(); 
                await AsyncStorage.removeItem(DRAFT_KEY); 
                navigation.dispatch(
                  CommonActions.reset({
                    index: 1,
                    routes: [{ name: 'Home' }, { name: 'WorkoutHistory' }],
                  })
                );
            } catch (error) { 
                toast.error('Erro ao finalizar'); 
            } finally { 
                setSaving(false); 
            }
        }}
    ]);
  }, [navigation, session, t]);

  const handleSaveSet = useCallback(async () => {
    if (!form.values.exerciseName?.trim() || form.values.weight === '' || form.values.reps === '') {
      toast(t('logWorkout.formValidation')); 
      return;
    }

    setSaving(true);
    Keyboard.dismiss();

    const weightToCarryOver = form.values.weight;
    const currentDefinitionId = form.values.definitionIdA;

    try {
      const isSuper = ['biset', 'triset'].includes(form.values.activeSetType);
      
      const getExInstance = async (name: string, currentDefId: string | null) => {
        let defId = currentDefId;
        if (!defId) {
           const newDef = await catalog.handleCreateExercise(name, { silent: true });
           if (!newDef) throw new Error(`Falha ao criar: ${name}`);
           defId = newDef.exercise_id;
        }
        const instanceId = await getOrCreateExerciseInWorkout(session.sessionWorkoutId!, defId);
        return { defId, instanceId };
      };

      const convertW = (val: string) => form.values.inputUnit === 'lbs' ? safeParse(val) * LBS_TO_KG_FACTOR : safeParse(val);

      if (isSuper) {
          const exA = await getExInstance(form.values.exerciseName, form.values.definitionIdA);
          const exB = await getExInstance(form.values.exerciseNameB, form.values.definitionIdB);
          let exC = null;
          if (form.values.activeSetType === 'triset') exC = await getExInstance(form.values.exerciseNameC, form.values.definitionIdC);
          
          const itemsToSave = [
            { exercise_id: exA.instanceId, weight: convertW(form.values.weight), reps: safeInt(form.values.reps), side: form.values.isUnilateral ? form.values.side : null },
            { exercise_id: exB.instanceId, weight: convertW(form.values.weightB), reps: safeInt(form.values.repsB), side: form.values.isUnilateralB ? form.values.sideB : null }
          ];
          if (exC) itemsToSave.push({ exercise_id: exC.instanceId, weight: convertW(form.values.weightC), reps: safeInt(form.values.repsC), side: form.values.isUnilateralC ? form.values.sideC : null });

          await saveSuperSet(itemsToSave, form.values.activeSetType);
          toast.success('Série combinada salva!');
          triggerHaptic('success');

      } else {
        const { instanceId } = await getExInstance(form.values.exerciseName, form.values.definitionIdA);
        
        const wKg = convertW(form.values.weight);
        const rVal = safeInt(form.values.reps);
        
        const userObs = form.values.observations ? form.values.observations.trim() : '';
        const autoTag = form.values.e1rmDisplayTag ? `[e1RM: ${form.values.e1rmDisplayTag}]` : '';
        const finalObsToSave = userObs ? (autoTag ? `${userObs} ${autoTag}` : userObs) : autoTag;

        let finalRpe = form.values.rpe ? safeParse(form.values.rpe) : undefined;
        if (finalRpe === undefined && form.values.activeSetType === 'normal') {
            finalRpe = 10; 
        }

        const commonData = {
          weight: wKg, 
          reps: rVal, 
          rpe: finalRpe, 
          observations: finalObsToSave || undefined, 
          side: form.values.isUnilateral ? form.values.side : undefined,
          set_type: form.values.activeSetType,
          subSets: form.values.subSets.map(s => ({ weight: safeParse(s.weight), reps: safeInt(s.reps) }))
        };

        let targetSetId = form.values.editingSetId;
        
        // [CORREÇÃO] Lógica para preservar séries prescritas se for Aquecimento
        if (form.values.activeSetType === 'warmup') {
            // Se estamos editando uma série, precisamos checar se ela JÁ ERA warmup
            if (targetSetId) {
                // Buscamos a série no estado local
                const currentExerciseData = session.groupedWorkout.find(e => e.id === instanceId);
                const setToEdit = currentExerciseData?.sets.find(s => s.id === targetSetId);
                
                // Se a série que estamos clicando NÃO era warmup, não devemos sobrescrevê-la.
                // Criamos uma nova série de aquecimento e deixamos a prescrita (Normal) intacta.
                if (setToEdit && setToEdit.set_type !== 'warmup') {
                    targetSetId = null; // Força criação de nova série
                }
            }
        } 
        
        // Se não for warmup (ou se targetSetId foi mantido), tenta encontrar o próximo slot vazio
        if (!targetSetId && session.isProgram && form.values.activeSetType !== 'warmup') { 
            const currentExerciseData = session.groupedWorkout.find(e => e.id === instanceId);
            const sets = currentExerciseData?.sets || [];
            // Encontra o primeiro slot normal vazio
            const nextEmptySet = [...sets]
                .sort((a, b) => (a.set_number - b.set_number))
                .find(s => (s.weight || 0) === 0 && (s.reps || 0) === 0 && s.set_type !== 'warmup');
            if (nextEmptySet) targetSetId = nextEmptySet.id;
        }

        if (targetSetId) {
           await updateSet(targetSetId, commonData as any);
           if (form.values.editingSetId) {
               toast.success('Série atualizada');
               form.setters.setEditingSetId(null); 
           } else {
               triggerHaptic('success'); 
           }
        } else {
           const currentExerciseData = session.groupedWorkout.find(e => e.id === instanceId);
           const nextNum = currentExerciseData ? currentExerciseData.sets.length + 1 : 1;
           const saved = await saveSet({ exercise_id: instanceId, set_number: nextNum, ...commonData });
           if (form.values.activeSetType !== 'warmup' && saved?.id) {
               triggerHaptic('success'); toast.success('Série registrada');
           }
        }

        if (userObs && !form.values.isSubstitutionMode && form.values.definitionIdA) {
           const { data: userData } = await supabase.auth.getUser();
           if (userData.user) {
              sendMessage(
                form.values.definitionIdA,
                userData.user.id,
                userData.user.id, 
                userObs,
                'aluno'
              ).catch(err => console.log('Erro silencioso ao enviar chat:', err));
           }
        }
      }

      await refreshSessionData();
      await AsyncStorage.removeItem(DRAFT_KEY);
      
      form.actions.resetForNextSet();

      // [LÓGICA DE AVANÇO] (Mantida igual, apenas garantindo que Aquecimento não avança o cursor)
      if (session.isProgram && !isSuper && currentDefinitionId && form.values.activeSetType !== 'warmup') { 
          const updatedWorkout = await fetchAndGroupWorkoutData(session.sessionWorkoutId!);
          const currentExIndex = updatedWorkout.findIndex(e => e.definition_id === currentDefinitionId);
          const exerciseInData = updatedWorkout[currentExIndex];

          if (exerciseInData) {
             const nextEmptySet = [...exerciseInData.sets]
                .sort((a, b) => a.set_number - b.set_number)
                .find(s => (s.weight || 0) === 0 && (s.reps || 0) === 0);

             if (nextEmptySet) {
                 loadSetIntoForm(nextEmptySet, exerciseInData, { preserveWeight: weightToCarryOver });
             } else {
                 let nextExIndex = currentExIndex + 1;
                 let nextExercise = updatedWorkout[nextExIndex];
                 
                 while (nextExercise && nextExercise.substituted_by_id) {
                    nextExIndex++;
                    nextExercise = updatedWorkout[nextExIndex];
                 }

                 if (nextExercise) {
                     Alert.alert(
                         'Exercício Finalizado',
                         'Todas as séries prescritas foram realizadas.',
                         [
                             {
                                 text: 'Adicionar Série',
                                 onPress: () => {
                                     form.setters.setExerciseName(exerciseInData.name);
                                     form.setters.setDefinitionIdA(exerciseInData.definition_id);
                                     form.setters.setWeight(weightToCarryOver);
                                     if (exerciseInData.is_unilateral) form.setters.setIsUnilateral(true);
                                 }
                             },
                             {
                                 text: 'Próximo Exercício',
                                 style: 'default',
                                 onPress: () => {
                                     const nextExFirstSet = [...nextExercise.sets]
                                        .sort((a, b) => a.set_number - b.set_number)
                                        .find(s => (s.weight || 0) === 0 && (s.reps || 0) === 0);
                                     
                                     if (nextExFirstSet) {
                                         loadSetIntoForm(nextExFirstSet, nextExercise);
                                     } else {
                                         form.setters.setExerciseName(nextExercise.name);
                                         form.setters.setDefinitionIdA(nextExercise.definition_id);
                                         perfA.fetchQuickStats(nextExercise.definition_id);
                                     }
                                 }
                             }
                         ]
                     );
                 } else {
                     Alert.alert(
                         'Treino Finalizado!',
                         'Você completou todos os exercícios.',
                         [
                             {
                                 text: 'Adicionar Série Extra',
                                 onPress: () => {
                                     form.setters.setExerciseName(exerciseInData.name);
                                     form.setters.setDefinitionIdA(exerciseInData.definition_id);
                                     form.setters.setWeight(weightToCarryOver);
                                 }
                             },
                             {
                                 text: 'Finalizar',
                                 style: 'default',
                                 onPress: handleFinish
                             }
                         ]
                     );
                 }
             }
          }
      }

    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  }, [form.values, session.sessionWorkoutId, perfA.exerciseStats, session.groupedWorkout, loadSetIntoForm, form.actions, handleFinish, session.isProgram]);

  const handleInitiateSubstitution = useCallback((exercise: WorkoutExercise) => {
    form.actions.clearForm();
    form.setters.setIsSubstitutionMode(true);
    form.setters.setSubstitutionOriginalName(exercise.name);
    form.setters.setSubstitutionOriginalId(exercise.id);
    toast(`Selecione o exercício para substituir ${exercise.name}`);
  }, [form.actions, form.setters]);

  const handleConfirmSubstitution = useCallback(async () => {
    if (!form.values.substitutionOriginalId || !form.values.definitionIdA || !session.sessionWorkoutId) {
      toast.error('Selecione um exercício válido para substituir.');
      return;
    }

    setSaving(true);
    try {
      let finalDefId = form.values.definitionIdA;
      if (!finalDefId) {
         const newDef = await catalog.handleCreateExercise(form.values.exerciseName, { silent: true });
         if (!newDef) throw new Error("Erro ao criar exercício.");
         finalDefId = newDef.exercise_id;
      }

      const newExerciseId = await substituteExerciseInWorkout(
        session.sessionWorkoutId,
        form.values.substitutionOriginalId,
        finalDefId
      );

      const hasDataToLog = form.values.weight && form.values.reps;
      
      if (hasDataToLog) {
         const { data: newSets } = await supabase
            .from('sets')
            .select('id, set_number')
            .eq('exercise_id', newExerciseId)
            .order('set_number', { ascending: true });

         const targetSet = newSets?.find(s => s.set_number === 1);

         const wKg = form.values.inputUnit === 'lbs' ? safeParse(form.values.weight) * LBS_TO_KG_FACTOR : safeParse(form.values.weight);
         const rVal = safeInt(form.values.reps);
         let finalRpe = form.values.rpe ? safeParse(form.values.rpe) : undefined;
         if (finalRpe === undefined) finalRpe = 10;

         const userObs = form.values.observations ? form.values.observations.trim() : '';
         const autoTag = form.values.e1rmDisplayTag ? `[e1RM: ${form.values.e1rmDisplayTag}]` : '';
         const finalObs = userObs ? (autoTag ? `${userObs} ${autoTag}` : userObs) : autoTag;

         const setData = {
            weight: wKg,
            reps: rVal,
            rpe: finalRpe,
            observations: finalObs || undefined,
            side: form.values.isUnilateral ? (form.values.side || 'D') : undefined
         };

         if (targetSet) {
            await updateSet(targetSet.id, setData);
         } else {
            await saveSet({
                exercise_id: newExerciseId,
                set_number: 1,
                ...setData,
                set_type: 'normal'
            });
         }
         
         toast.success('Exercício substituído e série registrada!');
         triggerHaptic('success');
      } else {
         toast.success('Exercício substituído!');
         triggerHaptic('success');
      }
      
      const updatedData = await refreshSessionData(); 
      form.actions.resetForNextSet(); 

      const newExerciseInstance = updatedData?.find(e => e.id === newExerciseId);

      if (newExerciseInstance) {
          form.setters.setExerciseName(newExerciseInstance.name);
          form.setters.setDefinitionIdA(newExerciseInstance.definition_id);
          perfA.fetchQuickStats(newExerciseInstance.definition_id);

          const nextEmptySet = newExerciseInstance.sets
             .sort((a, b) => a.set_number - b.set_number)
             .find(s => (s.weight || 0) === 0 && (s.reps || 0) === 0);

          if (nextEmptySet) {
             loadSetIntoForm(nextEmptySet, newExerciseInstance, { preserveWeight: form.values.weight });
          } else {
             form.setters.setEditingSetId(null);
          }
      } else {
          form.actions.clearForm();
      }

    } catch (e: any) {
      toast.error(e.message || 'Erro ao substituir.');
    } finally {
      setSaving(false);
    }
  }, [form.values, session.sessionWorkoutId, refreshSessionData, form.actions, catalog, loadSetIntoForm]);

  const handleEditSet = useCallback((set: WorkoutSet) => {
    requestAnimationFrame(() => {
        loadSetIntoForm(set);
        toast('Editando série...');
    });
  }, [loadSetIntoForm]);

  const handleDeleteSet = async (setId: string, _exId: string, _defId: string) => {
    let targetSet: WorkoutSet | undefined;
    for (const ex of session.groupedWorkout) {
      const found = ex.sets.find(s => s.id === setId);
      if (found) { targetSet = found; break; }
    }

    if (!targetSet) return;

    const isWarmup = targetSet.set_type === 'warmup';
    
    if (!session.isProgram || isWarmup) {
        Alert.alert(
          'Remover Série', 
          'Deseja apagar esta série?', 
          [
            { text: 'Cancelar', style: 'cancel' },
            { 
              text: 'Apagar', 
              style: 'destructive', 
              onPress: async () => {
                try {
                  await deleteSet(setId);
                  toast.success('Série removida');
                  refreshSessionData();
                } catch(e) { toast.error('Erro ao deletar'); }
              }
            }
          ]
        );
    } else {
        Alert.alert(
          'Limpar Série', 
          'Deseja limpar os dados desta série?', 
          [
            { text: 'Cancelar', style: 'cancel' },
            { 
              text: 'Limpar', 
              style: 'default', 
              onPress: async () => {
                try {
                  await updateSet(setId, { weight: 0, reps: 0, rpe: null, observations: null });
                  toast.success('Série reiniciada');
                  refreshSessionData();
                } catch(e) { toast.error('Erro ao limpar'); }
              }
            }
          ]
        );
    }
  };

  const handleDeleteExercise = async (exerciseInstanceId: string) => {
    if (session.isProgram) {
        Alert.alert(
          'Atenção', 
          'Em treinos programados, você não pode remover o exercício da lista. Você pode pular, deixar em branco ou substituir.'
        );
        return;
    }

    try {
        await deleteExercise(exerciseInstanceId);
        toast.success('Exercício removido');
        refreshSessionData();
        form.actions.fullReset();
    } catch(e) {
        toast.error('Erro ao remover exercício');
    }
  };

  const handleClearExerciseName = useCallback((field: 'A' | 'B' | 'C' = 'A') => { 
      if (field === 'A') {
        form.setters.setExerciseName(''); form.setters.setDefinitionIdA(null);
      } else if (field === 'B') {
        form.setters.setExerciseNameB(''); form.setters.setDefinitionIdB(null);
      } else {
        form.setters.setExerciseNameC(''); form.setters.setDefinitionIdC(null);
      }
  }, [form.setters]);

  return {
    form, session, catalog, perfA, perfB, perfC, saving, prSetIds, isAutocompleteFocused, setIsAutocompleteFocused,
    handleSaveSet, handleEditSet, handleDeleteSet, handleDeleteExercise, handleFinish, handleClearExerciseName, timer,
    handleInitiateSubstitution, handleConfirmSubstitution
  };
};