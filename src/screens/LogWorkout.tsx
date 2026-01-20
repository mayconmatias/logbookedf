import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  UIManager,
  Alert
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import { CommonActions } from '@react-navigation/native';

import type { RootStackParamList } from '@/types/navigation';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';

// Componentes UI
import { WorkoutForm, WorkoutFormProps } from '@/components/WorkoutForm'; 
import ExerciseCard from '@/components/ExerciseCard';
import { ExerciseAnalyticsSheet, ExerciseAnalyticsSheetRef } from '@/components/ExerciseAnalyticsSheet'; 

// Modais
import SetShareModal from '@/components/SetShareModal';
import ProgressionShareModal from '@/components/ProgressionShareModal';
import { ExerciseFeedbackModal } from '@/components/ExerciseFeedbackModal'; 
import SessionFeedbackModal from '@/components/SessionFeedbackModal';

// Hooks, Contexto e Serviços
import { useLogWorkoutController } from '@/hooks/useLogWorkoutController';
import { useShareFlows } from '@/hooks/useShareFlows';
import { useTimer } from '@/context/TimerContext';
import { supabase } from '@/lib/supabaseClient';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'LogWorkout'>;

export default function LogWorkoutScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const controller = useLogWorkoutController(route.params || {}, navigation);
  const { startTimer } = useTimer();

  // Estados do usuário
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Estados para o novo Fluxo de Feedback (Pós-treino)
  const [sessionFeedbackVisible, setSessionFeedbackVisible] = useState(false);
  const [sessionFeedbackConfig, setSessionFeedbackConfig] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  const {
    isSetShareModalVisible, isProgressionShareModalVisible, setToshare,
    isSharingPR, exerciseNameToShare, progressionDataForModal, currentSessionTEV,
    isFetchingShareData, handleOpenSetShareModal, handleCloseSetShareModal,
    handleOpenProgressionShareModal, handleCloseProgressionShareModal,
  } = useShareFlows(controller.session.groupedWorkout);

  // Controle do Modal de Instruções/Chat (ícone "I")
  const [isInstructionModalVisible, setIsInstructionModalVisible] = useState(false);
  const [activeInstructionDefId, setActiveInstructionDefId] = useState<string | null>(null);
  const [activeInstructionName, setActiveInstructionName] = useState('');
  
  const [instructionData, setInstructionData] = useState<{notes: string|null, video: string|null}>({ 
    notes: null, 
    video: null 
  });

  const analyticsSheetRef = useRef<ExerciseAnalyticsSheetRef>(null);

  // --- HANDLERS ---

  const handleShareSet = useCallback((set: WorkoutSet, isPR: boolean, exName: string, defId: string) => {
      if (isPR) handleOpenSetShareModal(set, true, exName, controller.session.sessionWorkoutId);
      else handleOpenProgressionShareModal(set, exName, defId);
  }, [handleOpenSetShareModal, handleOpenProgressionShareModal, controller.session.sessionWorkoutId]);

  // [CORREÇÃO AQUI] Removemos o 'currentBest' que estava causando o erro de UUID
  const handleShowFormAnalytics = useCallback((defId: string, name: string) => {
    if (!defId) return;
    
    analyticsSheetRef.current?.openSheet(
      defId, 
      name, 
      undefined // studentId (undefined = usuário atual)
    );
  }, []);

  const handleShowLogAnalytics = useCallback((definitionId: string, name: string) => {
    analyticsSheetRef.current?.openSheet(
      definitionId, 
      name, 
      undefined // studentId (undefined = usuário atual)
    );
  }, []);

  const handleSaveAndRest = async () => {
    await controller.handleSaveSet();
    startTimer();
  };
  
  const handleShowInstructionsModal = useCallback((defId: string) => {
    if (!defId) return;
    const exerciseInSession = controller.session.groupedWorkout.find(e => e.definition_id === defId);
    const exerciseInCatalog = controller.catalog.allExercises.find(e => e.exercise_id === defId);
    
    setActiveInstructionDefId(defId);
    setActiveInstructionName(exerciseInSession?.name || exerciseInCatalog?.exercise_name_capitalized || 'Exercício');
    
    setInstructionData({
        notes: exerciseInSession?.notes || null,
        video: exerciseInSession?.video_url || null
    });

    setIsInstructionModalVisible(true);
  }, [controller.session.groupedWorkout, controller.catalog.allExercises]);

  const handleFinishPress = async () => {
    const sessionId = controller.session.sessionWorkoutId;
    let config = { collect_rpe: true, collect_dalda: false, custom_questions: [] };

    if (sessionId) {
      try {
        const { data: wData } = await supabase.from('workouts').select('planned_workout_id').eq('id', sessionId).single();
        if (wData?.planned_workout_id) {
           const { data: pData } = await supabase.from('planned_workouts').select('program:programs(feedback_config)').eq('id', wData.planned_workout_id).single();
           // @ts-ignore
           if (pData?.program?.feedback_config) {
             // @ts-ignore
             config = pData.program.feedback_config;
           }
        }
      } catch (e) {}
    }
    setSessionFeedbackConfig(config);
    setSessionFeedbackVisible(true);
  };

  const onFeedbackSuccess = async () => {
    setSessionFeedbackVisible(false);
    await controller.handleFinish();
  };

  // --- PROPS COMPLETAS DO FORMULÁRIO ---
  const workoutFormProps: WorkoutFormProps = {
    // Campos A
    exerciseName: controller.form.values.exerciseName,
    setExerciseName: controller.form.setters.setExerciseName,
    weight: controller.form.values.weight,
    setWeight: controller.form.setters.setWeight,
    reps: controller.form.values.reps,
    setReps: controller.form.setters.setReps,
    rpe: controller.form.values.rpe,
    setRpe: controller.form.setters.setRpe,
    definitionIdA: controller.form.values.definitionIdA,

    // Campos B
    exerciseNameB: controller.form.values.exerciseNameB,
    setExerciseNameB: controller.form.setters.setExerciseNameB,
    weightB: controller.form.values.weightB,
    setWeightB: controller.form.setters.setWeightB,
    repsB: controller.form.values.repsB,
    setRepsB: controller.form.setters.setRepsB,
    definitionIdB: controller.form.values.definitionIdB,

    // Campos C
    exerciseNameC: controller.form.values.exerciseNameC,
    setExerciseNameC: controller.form.setters.setExerciseNameC,
    weightC: controller.form.values.weightC,
    setWeightC: controller.form.setters.setWeightC,
    repsC: controller.form.values.repsC,
    setRepsC: controller.form.setters.setRepsC,
    definitionIdC: controller.form.values.definitionIdC,

    // Configurações
    calculatedE1RMs: controller.form.values.calculatedE1RMs,
    e1rmDisplayTag: controller.form.values.e1rmDisplayTag, 
    finalObservations: controller.form.values.finalObservations,
    observations: controller.form.values.observations,
    setObservations: controller.form.setters.setObservations,
    subSets: controller.form.values.subSets,
    setSubSets: controller.form.setters.setSubSets,
    activeSetType: controller.form.values.activeSetType,
    setActiveSetType: controller.form.setters.setActiveSetType,
    
    // Unilaterais
    isUnilateral: controller.form.values.isUnilateral,
    setIsUnilateral: controller.form.setters.setIsUnilateral,
    side: controller.form.values.side,
    setSide: controller.form.setters.setSide,
    
    isUnilateralB: controller.form.values.isUnilateralB,
    setIsUnilateralB: controller.form.setters.setIsUnilateralB,
    sideB: controller.form.values.sideB,
    setSideB: controller.form.setters.setSideB,
    
    isUnilateralC: controller.form.values.isUnilateralC,
    setIsUnilateralC: controller.form.setters.setIsUnilateralC,
    sideC: controller.form.values.sideC,
    setSideC: controller.form.setters.setSideC,
    
    // Ações
    saving: controller.saving,
    handleSaveSet: controller.handleSaveSet,
    onSaveAndRest: handleSaveAndRest,
    
    // Autocomplete
    allExerciseNames: controller.catalog.allExerciseNames,
    isAutocompleteFocused: controller.isAutocompleteFocused,
    setIsAutocompleteFocused: controller.setIsAutocompleteFocused,
    
    // Performance
    perfA: {
      last: controller.perfA.performanceData?.lastPerformance || [],
      best: controller.perfA.performanceData?.bestPerformance || null
    },
    perfB: {
      last: controller.perfB.performanceData?.lastPerformance || [],
      best: controller.perfB.performanceData?.bestPerformance || null
    },
    perfC: {
      last: controller.perfC.performanceData?.lastPerformance || [],
      best: controller.perfC.performanceData?.bestPerformance || null
    },
    
    handleShowInfoModal: handleShowFormAnalytics, 
    onShowCoachInstructions: handleShowInstructionsModal, 
    
    // Unidade e Edição
    inputUnit: controller.form.values.inputUnit,
    setInputUnit: controller.form.setters.setInputUnit,
    toggleInputUnit: controller.form.actions.toggleInputUnit, 

    isEditing: !!controller.form.values.editingSetId,
    onCancelEdit: () => {
       controller.form.setters.setEditingSetId(null);
       controller.form.actions.clearForm();
    },
    onClearExerciseName: controller.handleClearExerciseName,

    isSubstitutionMode: controller.form.values.isSubstitutionMode,
    substitutionOriginalName: controller.form.values.substitutionOriginalName,
    onConfirmSubstitution: controller.handleConfirmSubstitution,
    onCancelSubstitution: () => controller.form.actions.clearForm()
  };

  if (controller.session.loading) {
     return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <DraggableFlatList
        data={controller.session.groupedWorkout}
        keyExtractor={item => item.id}
        onDragEnd={() => {}}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContentContainer}
        onScrollBeginDrag={() => { controller.setIsAutocompleteFocused(false); Keyboard.dismiss(); }}
        
        ListHeaderComponent={
          <>
            <WorkoutForm {...workoutFormProps} />
            <View style={styles.logContainer}>
              <Text style={styles.logTitle}>
                {route.params?.workoutId ? t('logWorkout.logTitleEdit') : t('logWorkout.logTitleNew')}
              </Text>
              {controller.session.groupedWorkout.length === 0 && (
                <Text style={styles.emptyText}>{t('logWorkout.emptyLog')}</Text>
              )}
            </View>
          </>
        }

        renderItem={({ item, drag, isActive }: RenderItemParams<WorkoutExercise>) => {
           const isEditingThisExercise = controller.form.values.definitionIdA === item.definition_id;

           return (
              <ExerciseCard
                exercise={item}
                activeTemplate={false}
                prSetIds={controller.prSetIds}
                isFetchingShareData={isFetchingShareData}
                isHighlighted={isEditingThisExercise}
                editingSetId={controller.form.values.editingSetId}
                isProgram={controller.session.isProgram}
                onSubstitute={controller.handleInitiateSubstitution}
                onShowAnalytics={handleShowLogAnalytics}
                onEditSet={controller.handleEditSet}
                onShareSet={handleShareSet}
                onDeleteSet={controller.handleDeleteSet}
                onDeleteExercise={controller.handleDeleteExercise}
                onPopulateForm={(name, id) => {
                   if (!controller.form.values.isSubstitutionMode) {
                      controller.form.setters.setExerciseName(name);
                      controller.form.setters.setDefinitionIdA(id);
                   }
                }}
                drag={drag}
                isActive={isActive}
              />
           );
        }}

        ListFooterComponent={
          <View style={styles.footer}>
             <TouchableOpacity style={styles.finishBtn} onPress={handleFinishPress}>
                <Text style={styles.finishText}>
                  {controller.session.isProgram ? 'Finalizar e Enviar Feedback' : 'Finalizar Treino'}
                </Text>
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
        definitionId={controller.form.values.definitionIdA || null}
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

      <ExerciseFeedbackModal 
        visible={isInstructionModalVisible}
        onClose={() => setIsInstructionModalVisible(false)}
        definitionId={activeInstructionDefId}
        exerciseName={activeInstructionName}
        userId={currentUserId} 
        currentNotes={instructionData.notes}
        currentVideoUrl={instructionData.video}
      />

      <SessionFeedbackModal 
        visible={sessionFeedbackVisible}
        workoutId={controller.session.sessionWorkoutId}
        config={sessionFeedbackConfig}
        onClose={() => setSessionFeedbackVisible(false)}
        onSuccess={onFeedbackSuccess}
      />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContentContainer: { paddingBottom: 20 },
  logContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 0 },
  logTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#1A202C' },
  emptyText: { fontSize: 16, color: '#777', textAlign: 'center', marginTop: 10, marginBottom: 10 },
  footer: { padding: 20, paddingTop: 0, marginTop: 10 },
  finishBtn: { 
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#007AFF', 
    padding: 14, borderRadius: 10, alignItems: 'center' 
  },
  finishText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 },
});