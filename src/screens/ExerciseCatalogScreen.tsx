import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard 
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { Feather } from '@expo/vector-icons';

import {
  getOrCreateTodayWorkoutId,
  fetchAndGroupWorkoutData,
} from '@/services/workouts.service';
import {
  fetchExerciseSetHistory,
  getOrCreateExerciseInWorkout,
  saveSet,
  updateExerciseInstructions,
} from '@/services/exercises.service';
import { CatalogExerciseItem, ExerciseSetHistoryItem } from '@/types/catalog';
import {
  ExerciseAnalyticsSheet,
  ExerciseAnalyticsSheetRef,
} from '@/components/ExerciseAnalyticsSheet';
import t from '@/i18n/pt';
import { useExerciseCatalog } from '@/hooks/useExerciseCatalog';
import { WorkoutExercise } from '@/types/workout';

// [NOVO] Helper para formatação
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(2)}`;
};

interface QuickAddFormProps {
  definitionId: string;
  onSetAdded: () => void;
}

const QuickAddForm: React.FC<QuickAddFormProps> = ({ definitionId, onSetAdded }) => {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [saving, setSaving] = useState(false);

  const handleQuickAdd = async () => {
    if (!weight || !reps) return Alert.alert(t.common.attention, 'Peso e Reps são obrigatórios.');
    setSaving(true);
    Keyboard.dismiss();
    try {
      const todayWorkoutId = await getOrCreateTodayWorkoutId();
      const exerciseInstanceId = await getOrCreateExerciseInWorkout(todayWorkoutId, definitionId);
      const todayWorkoutData = await fetchAndGroupWorkoutData(todayWorkoutId);
      
      const exerciseInWorkout = todayWorkoutData.find((ex: WorkoutExercise) => ex.id === exerciseInstanceId);
      const nextSetNumber = (exerciseInWorkout ? exerciseInWorkout.sets.length : 0) + 1;

      await saveSet({
        exercise_id: exerciseInstanceId,
        set_number: nextSetNumber,
        weight: parseFloat(weight),
        reps: parseInt(reps, 10),
        rpe: rpe ? parseFloat(rpe) : undefined,
      });
      setWeight(''); setReps(''); setRpe('');
      onSetAdded();
    } catch (e: any) {
      Alert.alert(t.common.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.quickAddForm}>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.inputFlex]} placeholder="Peso (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
        <TextInput style={[styles.input, styles.inputFlex]} placeholder="Reps" keyboardType="numeric" value={reps} onChangeText={setReps} />
        <TextInput style={[styles.input, styles.inputFlex]} placeholder="RPE" keyboardType="numeric" value={rpe} onChangeText={setRpe} />
      </View>
      <TouchableOpacity style={[styles.buttonPrimary, saving && styles.buttonDisabled]} onPress={handleQuickAdd} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.buttonTextPrimary}>Adicionar Agora</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

interface ExerciseHistoryProps {
  definitionId: string;
  exerciseNameCapitalized: string;
  onShowAnalytics: () => void;
  onOpenMenu: () => void;
}

const ExerciseHistoryNinho: React.FC<ExerciseHistoryProps> = ({ definitionId, onShowAnalytics, onOpenMenu }) => {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ExerciseSetHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const data = await fetchExerciseSetHistory(definitionId);
    setHistory(data);
    setLoading(false);
  }, [definitionId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <View style={styles.ninhoContainer}>
      <QuickAddForm definitionId={definitionId} onSetAdded={loadHistory} />
      
      <View style={styles.ninhoActionRow}>
         <TouchableOpacity style={styles.ninhoButton} onPress={onShowAnalytics}>
            <Feather name="bar-chart-2" size={16} color="#007AFF" />
            <Text style={styles.ninhoButtonText}>Ver Gráficos</Text>
         </TouchableOpacity>
         <View style={styles.sep} />
         <TouchableOpacity style={styles.ninhoButton} onPress={onOpenMenu}>
            <Feather name="settings" size={16} color="#007AFF" />
            <Text style={styles.ninhoButtonText}>Opções</Text>
         </TouchableOpacity>
      </View>

      {/* CABEÇALHO DA TABELA */}
      <View style={styles.tableHeader}>
         <Text style={[styles.colDate, styles.headerText]}>DATA</Text>
         <Text style={[styles.colSet, styles.headerText]}>SET</Text>
         <Text style={[styles.colLoad, styles.headerText]}>CARGA/REPS</Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : (
        <View style={styles.historyList}>
          {history.length === 0 ? <Text style={styles.historyEmpty}>Nenhuma série encontrada.</Text> : history.slice().reverse().map((item, index) => (
            <View key={`history-${definitionId}-${index}`} style={styles.historyRow}>
              <Text style={styles.colDate}>{formatDate(item.workout_date)}</Text>
              <Text style={styles.colSet}>#{item.set_number}</Text>
              
              <View style={styles.colLoadContainer}>
                 <Text style={styles.loadText}>{item.weight}kg x {item.reps}</Text>
                 {item.is_pr && <Feather name="award" size={14} color="#D69E2E" style={{marginLeft: 4}} />}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

type CatalogScreenProps = NativeStackScreenProps<RootStackParamList, 'ExerciseCatalog'>;

export default function ExerciseCatalogScreen({ navigation }: CatalogScreenProps) {
  const {
    loading, allExercises, filteredExercises, handleCreateExercise, handleRenameExercise,
    handleMergeExercises, handleDeleteExercise, searchTerm, setSearchTerm, loadCatalog
  } = useExerciseCatalog();

  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const analyticsSheetRef = useRef<ExerciseAnalyticsSheetRef>(null);

  const [isInstructionModalVisible, setIsInstructionModalVisible] = useState(false);
  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editVideo, setEditVideo] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);

  const promptToCreateExercise = useCallback(async () => {
    Alert.prompt('Novo Exercício', 'Nome do exercício:', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Salvar', 
        onPress: async (name?: string) => {
          if (!name) return;
          const newEx = await handleCreateExercise(name);
          if (newEx) setExpandedExercise(newEx.exercise_id);
      }}
    ], 'plain-text');
  }, [handleCreateExercise]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={promptToCreateExercise} style={{ paddingHorizontal: 16 }}>
          <Feather name="plus" size={28} color="#007AFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, promptToCreateExercise]);

  const handleEditInstructions = (item: CatalogExerciseItem) => {
    setEditingDefId(item.exercise_id);
    setEditNotes(item.default_notes || '');
    setEditVideo(item.video_url || '');
    setIsInstructionModalVisible(true);
  };

  const handleSaveInstructions = async () => {
    if (!editingDefId) return;
    setSavingInstructions(true);
    try {
      await updateExerciseInstructions(editingDefId, editNotes, editVideo);
      Alert.alert('Sucesso', 'Instruções atualizadas!');
      setIsInstructionModalVisible(false);
      await loadCatalog();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSavingInstructions(false);
    }
  };

  const handleEditName = (definitionId: string, oldNameCapitalized: string) => {
    Alert.prompt('Editar Nome', `Novo nome para "${oldNameCapitalized}":`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salvar', onPress: async (newName?: string) => {
          if (!newName || newName.trim() === '') return Alert.alert('Erro', 'Nome inválido');
          
          const existing = allExercises.find(ex => ex.exercise_name_lowercase === newName.trim().toLowerCase());
          if (existing) {
            Alert.alert('Duplicado', `"${newName}" já existe. Mesclar?`, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Mesclar', onPress: async () => {
                 const success = await handleMergeExercises(definitionId, existing.exercise_id);
                 if (success) setExpandedExercise(null);
              }}
            ]);
          } else {
            const success = await handleRenameExercise(definitionId, newName.trim());
            if (success) setExpandedExercise(null);
          }
      }}
    ], 'plain-text', oldNameCapitalized);
  };

  const handleDeleteHistoryWithConfirm = (definitionId: string, name: string) => {
    Alert.alert('Tem certeza?', `Isso apagará todo o histórico de "${name}".`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
          const success = await handleDeleteExercise(definitionId, name);
          if (success) setExpandedExercise(null);
      }}
    ]);
  };

  const handleOpenMenu = (item: CatalogExerciseItem) => {
    Alert.alert(`Opções para "${item.exercise_name_capitalized}"`, 'Escolha uma ação:', [
      { text: 'Editar Instruções', onPress: () => handleEditInstructions(item) },
      { text: 'Renomear', onPress: () => handleEditName(item.exercise_id, item.exercise_name_capitalized) },
      { text: 'Limpar Histórico', style: 'destructive', onPress: () => handleDeleteHistoryWithConfirm(item.exercise_id, item.exercise_name_capitalized) },
      { text: 'Cancelar', style: 'cancel' }
    ]);
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={styles.container}>
      <TextInput style={styles.searchInput} placeholder="Buscar exercício..." value={searchTerm} onChangeText={setSearchTerm} />
      <FlatList
        data={filteredExercises}
        keyExtractor={(item) => item.exercise_id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.emptyList}>Nenhum exercício encontrado.</Text>}
        renderItem={({ item }) => {
          const isExpanded = expandedExercise === item.exercise_id;
          return (
            <View style={styles.cardContainer}>
              <TouchableOpacity style={styles.card} onPress={() => setExpandedExercise(prev => prev === item.exercise_id ? null : item.exercise_id)}>
                <View style={styles.cardContent}><Text style={styles.cardTitle}>{item.exercise_name_capitalized}</Text></View>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={22} color="#4A5568" />
              </TouchableOpacity>
              {isExpanded && (
                <ExerciseHistoryNinho
                  definitionId={item.exercise_id}
                  exerciseNameCapitalized={item.exercise_name_capitalized}
                  onShowAnalytics={() => analyticsSheetRef.current?.openSheet(item.exercise_id, item.exercise_name_capitalized, null)}
                  onOpenMenu={() => handleOpenMenu(item)}
                />
              )}
            </View>
          );
        }}
      />

      <Modal visible={isInstructionModalVisible} transparent animationType="fade" onRequestClose={() => setIsInstructionModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Instruções Padrão</Text>
            <Text style={styles.modalSub}>Aparecerá ao prescrever este exercício.</Text>
            <Text style={styles.label}>Link de Vídeo</Text>
            <TextInput style={styles.input} placeholder="https://..." value={editVideo} onChangeText={setEditVideo} autoCapitalize="none" />
            <Text style={styles.label}>Observações</Text>
            <TextInput style={[styles.input, styles.textArea]} placeholder="Ex: Postura..." value={editNotes} onChangeText={setEditNotes} multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setIsInstructionModalVisible(false)}><Text style={styles.txtCancel}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSaveInstructions} disabled={savingInstructions}>
                {savingInstructions ? <ActivityIndicator color="#FFF" /> : <Text style={styles.txtSave}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ExerciseAnalyticsSheet ref={analyticsSheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchInput: { height: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 16, fontSize: 16, margin: 16, backgroundColor: '#F7FAFC' },
  emptyList: { textAlign: 'center', marginTop: 32, fontSize: 16, color: '#718096' },
  cardContainer: { backgroundColor: '#F7FAFC', marginHorizontal: 16, marginBottom: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cardContent: { flex: 1, marginRight: 10 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A202C', textTransform: 'capitalize' },
  ninhoContainer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  ninhoActionRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  ninhoButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  ninhoButtonText: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginLeft: 6 },
  sep: { width: 1, backgroundColor: '#E2E8F0' },
  
  // Estilos da Tabela
  tableHeader: { flexDirection: 'row', backgroundColor: '#F7FAFC', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EDF2F7' },
  headerText: { fontSize: 12, fontWeight: '700', color: '#718096' },
  colDate: { width: 80, fontSize: 14, color: '#4A5568' },
  colSet: { width: 50, textAlign: 'center', fontSize: 14, color: '#718096' },
  colLoadContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  colLoad: { flex: 1, textAlign: 'right' },
  loadText: { fontSize: 14, fontWeight: '600', color: '#1A202C', textAlign: 'right' },

  historyList: { maxHeight: 250 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#EDF2F7' },
  historyEmpty: { fontSize: 14, color: '#718096', textAlign: 'center', padding: 16 },
  
  quickAddForm: { padding: 16, backgroundColor: '#F7FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  inputFlex: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 16, backgroundColor: '#fff' },
  buttonPrimary: { backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { backgroundColor: '#A9A9A9' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalSub: { fontSize: 13, color: '#718096', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#2D3748', marginBottom: 6 },
  textArea: { height: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  btnCancel: { backgroundColor: '#EDF2F7' },
  btnSave: { backgroundColor: '#007AFF' },
  txtCancel: { color: '#4A5568', fontWeight: '600' },
  txtSave: { color: '#FFF', fontWeight: '600' },
});