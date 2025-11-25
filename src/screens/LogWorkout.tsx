import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDebounce } from 'use-debounce';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { 
  RenderItemParams, 
  ScaleDecorator 
} from 'react-native-draggable-flatlist';

import t from '@/i18n/pt';
import type { RootStackParamList } from '@/types/navigation';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';
import { PlannedExercise } from '@/types/coaching';
import { fetchPlannedExercises } from '@/services/workout_planning.service';

import WorkoutForm, { WorkoutFormProps } from '@/components/WorkoutForm';
import ExerciseCard from '@/components/ExerciseCard';
import {
  ExerciseAnalyticsSheet,
  ExerciseAnalyticsSheetRef,
} from '@/components/ExerciseAnalyticsSheet';
import SetShareModal from '@/components/SetShareModal';
import ProgressionShareModal from '@/components/ProgressionShareModal';

import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import { useExerciseCatalog } from '@/hooks/useExerciseCatalog';
import { usePerformancePeek } from '@/hooks/usePerformancePeek';
import { useShareFlows } from '@/hooks/useShareFlows';
import { useTimer } from '@/context/TimerContext';

import {
  getOrCreateExerciseInWorkout,
  saveSet,
  deleteSet,
  deleteExercise,
  updateSet,
  reorderWorkoutExercises,
} from '@/services/exercises.service';
import { fetchAndGroupWorkoutData } from '@/services/workouts.service'; 
import { calculateE1RM, LBS_TO_KG_FACTOR } from '@/utils/e1rm';
import { classifyPR } from '@/services/records.service';

type Props = NativeStackScreenProps<RootStackParamList, 'LogWorkout'>;

// [CORREÇÃO] Mantemos apenas este export default
export default function LogWorkoutScreen({ navigation, route }: Props) {
  const { workoutId: paramWorkoutId, templateId: paramTemplateId } = route.params || {};
  const { startTimer } = useTimer();

  const {
    loading,
    sessionWorkoutId,
    groupedWorkout,
    setGroupedWorkout,
    finishWorkout,
  } = useWorkoutSession(paramWorkoutId, paramTemplateId);

  const {
    allExercises: allExerciseDefinitions,
    allExerciseNames,
    handleCreateExercise: handleCreateDefinition,
  } = useExerciseCatalog();

  const {
    loadingStats,
    exerciseStats,
    fetchQuickStats,
    invalidateCache,
    clearPeek,
  } = usePerformancePeek();

  const {
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
  } = useShareFlows(groupedWorkout);

  const [definitionIdToShare, setDefinitionIdToShare] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inputUnit, setInputUnit] = useState<'kg' | 'lbs'>('kg');
  const [exerciseName, setExerciseName] = useState('');
  const [currentDefinitionId, setCurrentDefinitionId] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [observations, setObservations] = useState('');
  const [baseObservation, setBaseObservation] = useState('');
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [side, setSide] = useState<'E' | 'D' | null>(null);
  const [isAutocompleteFocused, setIsAutocompleteFocused] = useState(false);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());

  const [prescriptions, setPrescriptions] = useState<Record<string, PlannedExercise>>({});
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const currentPlan = currentDefinitionId ? prescriptions[currentDefinitionId] : null;
  
  const analyticsSheetRef = useRef<ExerciseAnalyticsSheetRef>(null);
  const [debouncedExerciseName] = useDebounce(exerciseName, 500);

  const handleCleanup = useCallback(() => {
    if (!paramWorkoutId) {
      finishWorkout();
    }
  }, [finishWorkout, paramWorkoutId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => { handleCleanup(); });
    return unsubscribe;
  }, [navigation, handleCleanup]);

  useEffect(() => {
    const applyPlan = async () => {
      if (paramTemplateId && sessionWorkoutId && !loading) {
        if (groupedWorkout.length > 0) {
          if (Object.keys(prescriptions).length === 0) {
             const plannedExercises = await fetchPlannedExercises(paramTemplateId);
             const prescrMap: Record<string, PlannedExercise> = {};
             plannedExercises.forEach(p => prescrMap[p.definition_id] = p);
             setPrescriptions(prescrMap);
          }
          return;
        }
        setLoadingPrescription(true);
        try {
          const plannedExercises = await fetchPlannedExercises(paramTemplateId);
          const prescrMap: Record<string, PlannedExercise> = {};
          
          for (const plan of plannedExercises) {
            const exInstanceId = await getOrCreateExerciseInWorkout(sessionWorkoutId, plan.definition_id);
            
            prescrMap[plan.definition_id] = plan;
            const targetSets = plan.sets_count || 3;
            
            for (let i = 1; i <= targetSets; i++) {
              await saveSet({
                exercise_id: exInstanceId,
                set_number: i,
                weight: 0,
                reps: 0,
                rpe: plan.rpe_target ? parseFloat(plan.rpe_target) : undefined,
              });
            }
          }
          setPrescriptions(prescrMap);
          const updatedData = await fetchAndGroupWorkoutData(sessionWorkoutId);
          setGroupedWorkout(updatedData);
        } catch (e) { 
          console.error("Erro ao aplicar plano:", e); 
        } finally { 
          setLoadingPrescription(false); 
        }
      }
    };
    applyPlan();
  }, [paramTemplateId, sessionWorkoutId, loading]);

  useEffect(() => {
    if (debouncedExerciseName.length >= 3 && !isAutocompleteFocused) {
      const foundDefinition = allExerciseDefinitions.find(
        (ex) => ex.exercise_name_lowercase === debouncedExerciseName.toLowerCase()
      );
      if (foundDefinition) {
        const defId = foundDefinition.exercise_id;
        if (currentDefinitionId !== defId) {
          setCurrentDefinitionId(defId);
          fetchQuickStats(defId);
        }
      } else {
        if (currentDefinitionId !== null) {
          setCurrentDefinitionId(null);
          clearPeek();
        }
      }
    } else {
      // Se o usuário limpar o campo, reseta o ID
      if (!exerciseName && currentDefinitionId !== null) {
        setCurrentDefinitionId(null);
        clearPeek();
      }
    }
  }, [debouncedExerciseName, isAutocompleteFocused, allExerciseDefinitions, fetchQuickStats, clearPeek, currentDefinitionId, exerciseName]);

  useEffect(() => {
    if (weight === '' || !reps) {
      setBaseObservation((prevBase) => {
        setObservations((prevObs) => (prevObs === prevBase ? '' : prevObs));
        return '';
      });
      return;
    }
    const rawWeight = parseFloat(weight);
    const repsNum = parseInt(reps, 10);
    
    if (isNaN(rawWeight) || isNaN(repsNum) || repsNum <= 0) return;
    
    let weightInKg = inputUnit === 'lbs' ? rawWeight * LBS_TO_KG_FACTOR : rawWeight;
    weightInKg = Math.round(weightInKg * 100) / 100;
    
    const e1rm = calculateE1RM(weightInKg, repsNum);
    if (!e1rm || !isFinite(e1rm)) return;
    
    const newBase = `e1RM estimada: ${e1rm.toFixed(1)} kg`;
    setBaseObservation((oldBase) => {
      setObservations((prevObs) => (!prevObs || prevObs === oldBase ? newBase : prevObs));
      return newBase;
    });
  }, [weight, reps, inputUnit]);

  useEffect(() => {
    const isUni = exerciseName.toLowerCase().includes('unilateral');
    setIsUnilateral(isUni);
    if (!isUni) setSide(null);
  }, [exerciseName]);

  const handleEditSet = useCallback((set: WorkoutSet, autoFillWeight?: string) => {
    setExerciseName(groupedWorkout.find(ex => ex.id === set.exercise_id)?.name || '');
    
    const weightToUse = autoFillWeight !== undefined ? autoFillWeight : (set.weight === null ? '' : set.weight.toString());
    setWeight(weightToUse);
    
    setReps(set.reps === 0 ? '' : set.reps.toString());
    setRpe(set.rpe ? set.rpe.toString() : '');
    setObservations(set.observations || '');
    
    if (set.side) { setIsUnilateral(true); setSide(set.side); } else { setIsUnilateral(false); setSide(null); }
    setEditingSetId(set.id);
    
    const ex = groupedWorkout.find(e => e.id === set.exercise_id);
    if (ex) {
      setCurrentDefinitionId(ex.definition_id);
      fetchQuickStats(ex.definition_id);
    }
  }, [groupedWorkout, fetchQuickStats]);

  const handleCancelEdit = () => {
    setEditingSetId(null);
    setWeight(''); setReps(''); setRpe(''); setObservations(''); setSide(null);
  };

  const handlePopulateForm = useCallback((name: string, defId: string) => {
    setExerciseName(name);
    setCurrentDefinitionId(defId);
    fetchQuickStats(defId);
    
    setWeight(''); 
    setReps(''); 
    setRpe(''); 
    setObservations(''); 
    setSide(null); 
    setEditingSetId(null); 

    Haptics.selectionAsync();
  }, [fetchQuickStats]);
  
  const handleClearForm = useCallback(() => {
    setExerciseName(''); setCurrentDefinitionId(null); setWeight(''); setReps(''); setRpe(''); setObservations(''); setSide(null); setEditingSetId(null); clearPeek();
  }, [clearPeek]);

  const handleShareSet = useCallback((set: WorkoutSet, isPR: boolean, exName: string, defId: string) => {
      setDefinitionIdToShare(defId);
      if (isPR) {
        handleOpenSetShareModal(set, true, exName, sessionWorkoutId); 
      } else {
        handleOpenProgressionShareModal(set, exName, defId);
      }
  }, [handleOpenSetShareModal, handleOpenProgressionShareModal, sessionWorkoutId]);

  const handleShowCoachInstructions = useCallback(() => {
    if (!currentDefinitionId) return;
    const plan = prescriptions[currentDefinitionId];
    const metaText = plan ? `Meta: ${plan.sets_count || '?'} sets x ${plan.reps_range || '?'} reps` : 'Sem meta definida';
    const notes = plan?.notes || (plan as any)?.default_notes || 'Sem observações.';
    const video = (plan as any)?.video_url;
    Alert.alert('Instruções do Treino', `${metaText}\n\n📝 ${notes}${video ? '\n\n🎥 Há um vídeo disponível.' : ''}`, [{ text: 'Fechar', style: 'cancel' }, video ? { text: 'Ver Vídeo', onPress: () => Linking.openURL(video) } : { text: 'OK' }]);
  }, [currentDefinitionId, prescriptions]);

  const handleSaveAndRest = async () => {
    if (!exerciseName || weight === '' || !reps || !sessionWorkoutId) {
      Alert.alert(t.common.attention, t.logWorkout.formValidation);
      return;
    }
    if (isUnilateral && !side) {
      Alert.alert(t.common.attention, t.logWorkout.unilateralValidation);
      return;
    }

    await handleSaveSet(); 
    
    const plannedRest = currentDefinitionId ? prescriptions[currentDefinitionId]?.rest_seconds : undefined;
    startTimer(plannedRest || undefined); 
  };

  const handleSaveSet = useCallback(async () => {
    if (loadingStats) return;
    
    if (!exerciseName || weight === '' || !reps || !sessionWorkoutId) {
      return Alert.alert(t.common.attention, t.logWorkout.formValidation);
    }
    if (isUnilateral && !side) {
      return Alert.alert(t.common.attention, t.logWorkout.unilateralValidation);
    }

    setSaving(true);
    let definitionId = currentDefinitionId;

    try {
      // --- FIX PARA O BUG DE EXERCÍCIO ERRADO ---
      if (definitionId) {
        const currentDefInCatalog = allExerciseDefinitions.find(ex => ex.exercise_id === definitionId);
        if (currentDefInCatalog && currentDefInCatalog.exercise_name_lowercase !== exerciseName.trim().toLowerCase()) {
           definitionId = null; 
        }
      }
      
      if (!definitionId) {
        const existingDef = allExerciseDefinitions.find(ex => ex.exercise_name_lowercase === exerciseName.trim().toLowerCase());
        
        if (existingDef) {
          definitionId = existingDef.exercise_id;
        } else {
          const newDefinition = await handleCreateDefinition(exerciseName);
          if (!newDefinition) throw new Error('Falha ao criar exercício.');
          definitionId = newDefinition.exercise_id;
        }
        setCurrentDefinitionId(definitionId);
      }

      if (!definitionId) throw new Error('ID de definição não encontrado.');

      const exerciseInstanceId = await getOrCreateExerciseInWorkout(sessionWorkoutId, definitionId);
      
      const rawWeight = parseFloat(weight);
      if (isNaN(rawWeight)) throw new Error('Peso inválido.');

      let weightInKg = inputUnit === 'lbs' ? rawWeight * LBS_TO_KG_FACTOR : rawWeight;
      weightInKg = Math.round(weightInKg * 100) / 100;

      const commonData = {
        weight: weightInKg,
        reps: parseInt(reps, 10),
        rpe: rpe ? parseFloat(rpe) : undefined,
        observations: observations || undefined,
        side: isUnilateral && side ? side : undefined,
      };

      let savedSet: WorkoutSet;
      if (editingSetId) {
        savedSet = await updateSet(editingSetId, commonData) as WorkoutSet;
      } else {
        const existingExercise = groupedWorkout.find((ex) => ex.id === exerciseInstanceId);
        const nextSetNumber = (existingExercise ? existingExercise.sets.length : 0) + 1;
        savedSet = await saveSet({
          exercise_id: exerciseInstanceId,
          set_number: nextSetNumber,
          ...commonData
        });
      }

      const pr = classifyPR(
        savedSet.weight, 
        savedSet.reps, 
        exerciseStats
      );

      if (pr.isPR) {
        setPrSetIds((prev) => new Set(prev).add(savedSet.id));
        invalidateCache(definitionId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const updatedData = await fetchAndGroupWorkoutData(sessionWorkoutId);
      setGroupedWorkout(updatedData);

      const plan = prescriptions[definitionId];
      const targetSets = plan?.sets_count || 0;
      
      if (targetSets > 0 && savedSet.set_number === targetSets) {
        const currentExIndex = updatedData.findIndex(ex => ex.id === exerciseInstanceId);
        const nextExercise = updatedData[currentExIndex + 1];
        
        if (nextExercise) {
          Alert.alert(
            'Exercício Concluído! 🎉',
            `Você finalizou as ${targetSets} séries.`,
            [
              { text: 'Add Extra', style: 'cancel', onPress: () => { handleCancelEdit(); setReps(''); setRpe(''); } },
              { text: `Ir p/ ${nextExercise.name}`, onPress: () => {
                  if (nextExercise.sets.length > 0) handleEditSet(nextExercise.sets[0]);
                  else handlePopulateForm(nextExercise.name, nextExercise.definition_id);
              }}
            ]
          );
          return;
        } else {
           Alert.alert('Treino Concluído! 🏆', 'Todos os exercícios finalizados.', [{ text: 'Continuar', style: 'cancel' }, { text: 'Finalizar', onPress: handleFinishWorkout }]);
          return;
        }
      }

      const exerciseUpdated = updatedData.find(ex => ex.id === exerciseInstanceId);
      if (editingSetId && exerciseUpdated) {
        const nextSet = exerciseUpdated.sets.find(s => s.set_number === savedSet.set_number + 1);
        if (nextSet && nextSet.weight === 0 && nextSet.reps === 0) handleEditSet(nextSet, weight); 
        else handleCancelEdit();
      } else {
        setReps(''); setRpe(''); setObservations(baseObservation);
      }

    } catch (e: any) { 
      Alert.alert(t.common.error, e.message); 
    } finally { 
      setSaving(false); 
    }
  }, [sessionWorkoutId, exerciseName, weight, reps, rpe, observations, inputUnit, isUnilateral, side, groupedWorkout, exerciseStats, loadingStats, baseObservation, setGroupedWorkout, setPrSetIds, currentDefinitionId, handleCreateDefinition, invalidateCache, editingSetId, prescriptions, handleCancelEdit, handleEditSet, handlePopulateForm, allExerciseDefinitions]);

  const handleDeleteSet = useCallback(async (setId: string, exerciseId: string, definitionId: string) => {
    try {
      await deleteSet(setId);
      const updatedData = await fetchAndGroupWorkoutData(sessionWorkoutId!);
      setGroupedWorkout(updatedData);
      invalidateCache(definitionId);
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }, [setGroupedWorkout, invalidateCache, sessionWorkoutId]);

  const handleDeleteExercise = useCallback(async (exerciseInstanceId: string, exerciseName: string) => {
      try {
        await deleteExercise(exerciseInstanceId);
        setGroupedWorkout((currentData) => currentData.filter((ex) => ex.id !== exerciseInstanceId));
      } catch (e: any) { Alert.alert('Erro', e.message); }
  }, [setGroupedWorkout]);

  const handleShowFormAnalytics = useCallback(() => {
    if (!currentDefinitionId) return;
    analyticsSheetRef.current?.openSheet(currentDefinitionId, exerciseName, null);
  }, [currentDefinitionId, exerciseName]);

  const handleShowLogAnalytics = useCallback((definitionId: string, name: string) => {
    analyticsSheetRef.current?.openSheet(definitionId, name);
  }, []);

  const handleFinishWorkout = () => {
    navigation.replace('WorkoutHistory', { highlightWorkoutId: sessionWorkoutId || paramWorkoutId });
  };

  const onDragEnd = async ({ data }: { data: WorkoutExercise[] }) => {
    setGroupedWorkout(data);
    setIsReordering(true);
    const updates = data.map((ex, index) => ({ id: ex.id, order: index }));
    try {
      await reorderWorkoutExercises(updates);
    } catch (e: any) {
      console.error('Erro ao reordenar:', e.message);
      Alert.alert('Erro', 'Falha ao salvar a nova ordem.');
    } finally {
      setIsReordering(false);
    }
  };

  const templateHint = useMemo(() => {
    if (currentPlan) {
      return `Meta: ${currentPlan.sets_count || '?'} x ${currentPlan.reps_range || '?'} @ RPE ${currentPlan.rpe_target || '?'}`;
    }
    
    if (exerciseStats && exerciseStats.max_reps_by_weight) {
      let bestSet = { weight: 0, reps: 0, e1rm: 0 };
      Object.entries(exerciseStats.max_reps_by_weight).forEach(([wStr, r]) => {
        const w = parseFloat(wStr);
        const e = calculateE1RM(w, r);
        if (e > bestSet.e1rm) {
          bestSet = { weight: w, reps: r, e1rm: e };
        }
      });
      if (bestSet.weight > 0) {
        return `Melhor série: ${bestSet.weight} kg pra ${bestSet.reps} reps (e1RM ${bestSet.e1rm.toFixed(0)} kg)`;
      }
    }
    return '';
  }, [currentPlan, exerciseStats]);

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" /></View>;

  const workoutFormProps: WorkoutFormProps = {
    exerciseName,
    setExerciseName,
    weight,
    setWeight,
    reps,
    setReps,
    rpe,
    setRpe,
    observations,
    setObservations,
    saving,
    handleSaveSet,
    onSaveAndRest: handleSaveAndRest,
    allExerciseNames,
    isAutocompleteFocused,
    setIsAutocompleteFocused,
    loadingPerformance: loadingStats,
    lastPerformance: [],
    bestPerformance: null,
    handleShowInfoModal: handleShowFormAnalytics,
    templateHint: templateHint,
    isTemplateMode: false,
    isUnilateral,
    side,
    setSide,
    inputUnit,
    setInputUnit,
    isEditing: !!editingSetId,
    onCancelEdit: handleCancelEdit,
    onShowCoachInstructions: currentPlan ? handleShowCoachInstructions : undefined,
    onClear: handleClearForm,
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <DraggableFlatList
        data={groupedWorkout}
        onDragEnd={onDragEnd}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContentContainer}
        onScrollBeginDrag={() => setIsAutocompleteFocused(false)}
        ListHeaderComponent={
          <>
            <WorkoutForm {...workoutFormProps} />
            <View style={styles.logContainer}>
              <Text style={styles.logTitle}>{paramWorkoutId ? t.logWorkout.logTitleEdit : (paramTemplateId ? 'Treino Prescrito' : t.logWorkout.logTitleNew)}</Text>
              {loadingPrescription && <ActivityIndicator size="small" color="#007AFF" style={{marginBottom: 10}} />}
              {groupedWorkout.length === 0 && !loadingPrescription && <Text style={styles.emptyText}>{t.logWorkout.emptyLog}</Text>}
            </View>
          </>
        }
        renderItem={({ item, drag, isActive }: RenderItemParams<WorkoutExercise>) => (
          <ExerciseCard
            exercise={item}
            activeTemplate={false}
            prSetIds={prSetIds}
            isFetchingShareData={isFetchingShareData}
            onShowAnalytics={handleShowLogAnalytics}
            onEditSet={handleEditSet}
            onShareSet={handleShareSet}
            onDeleteSet={handleDeleteSet}
            onPopulateForm={handlePopulateForm}
            drag={drag}
            isActive={isActive}
          />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <TouchableOpacity style={styles.buttonSecondary} onPress={handleFinishWorkout}>
              <Text style={styles.buttonTextSecondary}>{paramWorkoutId ? t.logWorkout.updateWorkoutButton : t.logWorkout.finishWorkoutButton}</Text>
            </TouchableOpacity>
          </View>
        }
      />
      
      <ExerciseAnalyticsSheet ref={analyticsSheetRef} />
      <SetShareModal
        visible={isSetShareModalVisible}
        onClose={handleCloseSetShareModal}
        exerciseName={exerciseNameToShare}
        set={setToshare}
        definitionId={definitionIdToShare}
        isPR={isSharingPR}
      />
      <ProgressionShareModal
        visible={isProgressionShareModalVisible}
        onClose={handleCloseProgressionShareModal}
        exerciseName={exerciseNameToShare}
        set={setToshare}
        progression={progressionDataForModal}
        currentSessionTEV={currentSessionTEV}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContentContainer: { paddingBottom: 20 },
  logContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 0 },
  logTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  emptyText: { fontSize: 16, color: '#777', textAlign: 'center', marginTop: 10, marginBottom: 10 },
  footer: { padding: 20, paddingTop: 0, marginTop: 10 },
  buttonSecondary: { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  buttonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
});