import React, { useRef, useState, useCallback, useEffect } from 'react';
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
  Keyboard,
  Modal,
  TextInput,
  LayoutAnimation,
  UIManager
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import t from '@/i18n/pt';
import type { RootStackParamList } from '@/types/navigation';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';

// Componentes
import { WorkoutForm, WorkoutFormProps } from '@/components/WorkoutForm'; 
import ExerciseCard from '@/components/ExerciseCard';
import { ExerciseAnalyticsSheet, ExerciseAnalyticsSheetRef } from '@/components/ExerciseAnalyticsSheet'; 

import SetShareModal from '@/components/SetShareModal';
import ProgressionShareModal from '@/components/ProgressionShareModal';
import VideoPlayerModal from '@/components/VideoPlayerModal';

// Hooks e Contexto
import { useLogWorkoutController } from '@/hooks/useLogWorkoutController';
import { useShareFlows } from '@/hooks/useShareFlows';
import { useTimer } from '@/context/TimerContext';
import { supabase } from '@/lib/supabaseClient';
import { updateExerciseInstructions } from '@/services/exercises.service';
import { calculateE1RM, LBS_TO_KG_FACTOR } from '@/utils/e1rm';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'LogWorkout'>;

export default function LogWorkoutScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const controller = useLogWorkoutController(route.params || {}, navigation);
  const { startTimer } = useTimer();

  const {
    isSetShareModalVisible, isProgressionShareModalVisible, setToshare,
    isSharingPR, exerciseNameToShare, progressionDataForModal, currentSessionTEV,
    isFetchingShareData, handleOpenSetShareModal, handleCloseSetShareModal,
    handleOpenProgressionShareModal, handleCloseProgressionShareModal,
  } = useShareFlows(controller.session.groupedWorkout);

  const [isInstructionModalVisible, setIsInstructionModalVisible] = useState(false);
  const [instructionNote, setInstructionNote] = useState('');
  const [instructionVideo, setInstructionVideo] = useState('');
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);

  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState('');

  const analyticsSheetRef = useRef<ExerciseAnalyticsSheetRef>(null);

  const handleShareSet = useCallback((set: WorkoutSet, isPR: boolean, exName: string, defId: string) => {
      if (isPR) handleOpenSetShareModal(set, true, exName, controller.session.sessionWorkoutId);
      else handleOpenProgressionShareModal(set, exName, defId);
  }, [handleOpenSetShareModal, handleOpenProgressionShareModal, controller.session.sessionWorkoutId]);

  // [CORREÇÃO 1] Passando o ID da sessão atual para excluir do histórico
  const handleShowFormAnalytics = useCallback(() => {
    if (!controller.form.values.definitionIdA) return;
    const currentBest = controller.performance.performanceData?.bestPerformance || null;
    
    analyticsSheetRef.current?.openSheet(
      controller.form.values.definitionIdA, 
      controller.form.values.exerciseName, 
      currentBest,
      undefined,
      controller.session.sessionWorkoutId // <--- AQUI
    );
  }, [controller.form.values.definitionIdA, controller.form.values.exerciseName, controller.performance.performanceData, controller.session.sessionWorkoutId]);

  // [CORREÇÃO 2] Passando o ID da sessão atual também na lista
  const handleShowLogAnalytics = useCallback((definitionId: string, name: string) => {
    analyticsSheetRef.current?.openSheet(
      definitionId, 
      name, 
      null, 
      undefined, 
      controller.session.sessionWorkoutId // <--- AQUI
    );
  }, [controller.session.sessionWorkoutId]);

  const handleSaveAndRest = async () => {
    await controller.handleSaveSet();
    startTimer();
  };
  
  const handleShowInstructionsModal = async () => {
    if (!controller.form.values.definitionIdA) return;
    setIsInstructionModalVisible(true);
    setLoadingInstructions(true);
    try {
      const { data, error } = await supabase
        .from('exercise_definitions')
        .select('default_notes, video_url')
        .eq('id', controller.form.values.definitionIdA)
        .single();
      if (error) throw error;
      setInstructionNote(data?.default_notes || '');
      setInstructionVideo(data?.video_url || '');
    } catch (e) { console.log(e); } finally { setLoadingInstructions(false); }
  };

  const handleSaveInstructions = async () => {
    if (!controller.form.values.definitionIdA) return;
    setSavingInstructions(true);
    try {
      await updateExerciseInstructions(controller.form.values.definitionIdA, instructionNote, instructionVideo);
      Alert.alert('Sucesso', 'Ajustes salvos!');
      setIsInstructionModalVisible(false);
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSavingInstructions(false); }
  };

  const handleOpenVideo = () => {
    if (instructionVideo) {
       setActiveVideoUrl(instructionVideo);
       setVideoModalVisible(true);
    }
  };

  const workoutFormProps: WorkoutFormProps = {
    exerciseName: controller.form.values.exerciseName,
    setExerciseName: controller.form.setters.setExerciseName,
    weight: controller.form.values.weight,
    setWeight: controller.form.setters.setWeight,
    reps: controller.form.values.reps,
    setReps: controller.form.setters.setReps,
    rpe: controller.form.values.rpe,
    setRpe: controller.form.setters.setRpe,
    definitionIdA: controller.form.values.definitionIdA,

    exerciseNameB: controller.form.values.exerciseNameB,
    setExerciseNameB: controller.form.setters.setExerciseNameB,
    weightB: controller.form.values.weightB,
    setWeightB: controller.form.setters.setWeightB,
    repsB: controller.form.setters.setRepsB,
    definitionIdB: controller.form.values.definitionIdB,

    exerciseNameC: controller.form.values.exerciseNameC,
    setExerciseNameC: controller.form.setters.setExerciseNameC,
    weightC: controller.form.values.weightC,
    setWeightC: controller.form.setters.setWeightC,
    repsC: controller.form.setters.setRepsC,
    definitionIdC: controller.form.values.definitionIdC,

    subSets: controller.form.values.subSets,
    setSubSets: controller.form.setters.setSubSets,

    activeSetType: controller.form.values.activeSetType,
    setActiveSetType: controller.form.setters.setActiveSetType,
    
    observations: controller.form.values.observations,
    setObservations: controller.form.setters.setObservations,
    
    saving: controller.saving,
    handleSaveSet: controller.handleSaveSet,
    onSaveAndRest: handleSaveAndRest,
    
    allExerciseNames: controller.catalog.allExerciseNames,
    isAutocompleteFocused: controller.isAutocompleteFocused,
    setIsAutocompleteFocused: controller.setIsAutocompleteFocused,
    
    loadingPerformance: controller.performance.loadingStats,
    lastPerformance: controller.performance.performanceData?.lastPerformance || [],
    bestPerformance: controller.performance.performanceData?.bestPerformance || null,
    
    handleShowInfoModal: handleShowFormAnalytics,
    onShowCoachInstructions: handleShowInstructionsModal,
    
    isUnilateral: controller.form.values.isUnilateral,
    side: controller.form.values.side,
    setSide: controller.form.setters.setSide,
    inputUnit: controller.form.values.inputUnit,
    setInputUnit: controller.form.setters.setInputUnit,
    
    isEditing: !!controller.form.values.editingSetId,
    onCancelEdit: () => {
       controller.form.setters.setEditingSetId(null);
       controller.form.actions.clearForm();
    },
    onClearExerciseName: controller.handleClearExerciseName
  };

  if (controller.session.loading) {
     return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <DraggableFlatList
        data={controller.session.groupedWorkout}
        keyExtractor={item => item.id}
        onDragEnd={(data) => { }}
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
           const isEditingThisExercise = !!controller.form.values.editingSetId && 
                                         item.sets.some(s => s.id === controller.form.values.editingSetId);

           return (
              <ExerciseCard
                exercise={item}
                activeTemplate={false}
                prSetIds={controller.prSetIds}
                isFetchingShareData={isFetchingShareData}
                
                isHighlighted={isEditingThisExercise}
                editingSetId={controller.form.values.editingSetId}

                onShowAnalytics={handleShowLogAnalytics}
                onEditSet={controller.handleEditSet}
                onShareSet={handleShareSet}
                onDeleteSet={controller.handleDeleteSet}
                onDeleteExercise={controller.handleDeleteExercise}
                
                onPopulateForm={(name, id) => {
                   controller.form.setters.setExerciseName(name);
                   controller.form.setters.setDefinitionIdA(id);
                }}
                
                drag={drag}
                isActive={isActive}
              />
           );
        }}

        ListFooterComponent={
          <View style={styles.footer}>
             <TouchableOpacity style={styles.finishBtn} onPress={controller.handleFinish}>
                <Text style={styles.finishText}>{t('logWorkout.finishWorkoutButton')}</Text>
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

      <VideoPlayerModal 
        visible={videoModalVisible} 
        videoUrl={activeVideoUrl} 
        onClose={() => setVideoModalVisible(false)} 
      />

      <Modal
        visible={isInstructionModalVisible}
        transparent
        animationType="fade" 
        onRequestClose={() => setIsInstructionModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsInstructionModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardContainer}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Instruções & Ajustes</Text>
                <TouchableOpacity onPress={() => setIsInstructionModalVisible(false)}>
                  <Feather name="x" size={24} color="#718096" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.modalSubtitle}>
                Edite aqui os detalhes fixos deste exercício (ex: altura do banco, pino da máquina).
              </Text>

              {loadingInstructions ? (
                <ActivityIndicator size="large" color="#007AFF" style={{marginVertical: 20}} />
              ) : (
                <>
                  <Text style={styles.modalLabel}>Notas de Execução</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextArea]}
                    placeholder="Ex: Banco no 3, pegada aberta..."
                    multiline
                    textAlignVertical="top"
                    value={instructionNote}
                    onChangeText={setInstructionNote}
                  />

                  <Text style={styles.modalLabel}>Link de Vídeo</Text>
                  <View style={{flexDirection: 'row', gap: 10}}>
                     <TextInput
                       style={[styles.modalInput, { flex: 1 }]}
                       placeholder="https://..."
                       value={instructionVideo}
                       onChangeText={setInstructionVideo}
                       autoCapitalize="none"
                     />
                     {instructionVideo.length > 0 && (
                       <TouchableOpacity style={styles.modalVideoBtn} onPress={handleOpenVideo}>
                          <Feather name="play" size={20} color="#FFF" />
                       </TouchableOpacity>
                     )}
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveInstructions} disabled={savingInstructions}>
                      {savingInstructions ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={styles.modalSaveText}>Salvar Ajustes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

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
    backgroundColor: '#FFF', 
    borderWidth: 1, 
    borderColor: '#007AFF', 
    padding: 14, 
    borderRadius: 10, 
    alignItems: 'center' 
  },
  finishText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 },

  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    justifyContent: 'center', 
    alignItems: 'center',
    padding: 20
  },
  modalKeyboardContainer: {
    width: '100%',
    alignItems: 'center',
  },
  modalContent: { 
    width: '100%',
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 24, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 12, 
    elevation: 10 
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2D3748' },
  modalSubtitle: { fontSize: 14, color: '#718096', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 8 },
  modalInput: { 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 8, 
    padding: 12, 
    fontSize: 16, 
    marginBottom: 16, 
    backgroundColor: '#F7FAFC',
    color: '#2D3748'
  },
  modalTextArea: { height: 100 },
  modalVideoBtn: { 
    backgroundColor: '#E53E3E', 
    borderRadius: 8, 
    width: 48, 
    height: 48, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 16 
  },
  modalActions: { marginTop: 8 },
  modalSaveBtn: { 
    backgroundColor: '#007AFF', 
    padding: 16, 
    borderRadius: 10, 
    alignItems: 'center' 
  },
  modalSaveText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});