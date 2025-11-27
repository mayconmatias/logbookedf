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
  Keyboard // [Importante para UX]
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

// Formatador de data simples
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(2)}`;
};

interface QuickAddFormProps {
  definitionId: string;
  lastSet?: ExerciseSetHistoryItem; // [NOVO] Recebe a última série para preencher
  onSetAdded: () => void;
}

const QuickAddForm: React.FC<QuickAddFormProps> = ({ definitionId, lastSet, onSetAdded }) => {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [saving, setSaving] = useState(false);

  // [UX] Pré-preenche os campos quando o histórico carregar
  useEffect(() => {
    if (lastSet) {
      setWeight(lastSet.weight.toString());
      setReps(lastSet.reps.toString());
      // RPE geralmente não salvamos no histórico simplificado, mas se tivesse, iria aqui
    }
  }, [lastSet]);

  const handleQuickAdd = async () => {
    if (!weight || !reps) return Alert.alert(t.common.attention, 'Peso e Reps são obrigatórios.');
    
    setSaving(true);
    Keyboard.dismiss(); // Baixa o teclado

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

      // Não limpamos os campos, mantemos a carga anterior para facilitar séries seguidas (Pirâmide)
      // Apenas damos feedback visual
      Alert.alert('Sucesso', 'Série adicionada ao treino de hoje!'); 
      onSetAdded();
      
    } catch (e: any) {
      Alert.alert(t.common.error, e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.quickAddForm}>
      <Text style={styles.sectionLabel}>Adicionar Série ao Treino de Hoje:</Text>
      
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Carga (kg)</Text>
          <TextInput 
            style={styles.input} 
            placeholder="0" 
            keyboardType="numeric" 
            value={weight} 
            onChangeText={setWeight}
            selectTextOnFocus // Facilita edição
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Reps</Text>
          <TextInput 
            style={styles.input} 
            placeholder="0" 
            keyboardType="numeric" 
            value={reps} 
            onChangeText={setReps}
            selectTextOnFocus
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>RPE (opc)</Text>
          <TextInput 
            style={styles.input} 
            placeholder="-" 
            keyboardType="numeric" 
            value={rpe} 
            onChangeText={setRpe}
            selectTextOnFocus
          />
        </View>
      </View>

      <TouchableOpacity style={[styles.buttonPrimary, saving && styles.buttonDisabled]} onPress={handleQuickAdd} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <Feather name="plus-circle" size={18} color="#fff" />
            <Text style={styles.buttonTextPrimary}>Registrar Série</Text>
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

  // Pega o último item do histórico (assumindo que vem ordenado por data ASC do backend, o último é o mais recente)
  const lastSet = history.length > 0 ? history[history.length - 1] : undefined;

  return (
    <View style={styles.ninhoContainer}>
      
      <View style={styles.ninhoHeader}>
         <View style={styles.ninhoHeaderLeft}>
            <Feather name="clock" size={14} color="#718096" />
            <Text style={styles.ninhoHeaderTitle}>Histórico Recente</Text>
         </View>
         <View style={styles.ninhoActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={onShowAnalytics}>
              <Feather name="bar-chart-2" size={20} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={onOpenMenu}>
              <Feather name="more-horizontal" size={20} color="#4A5568" />
            </TouchableOpacity>
         </View>
      </View>

      {/* TABELA DE HISTÓRICO */}
      {loading ? <ActivityIndicator style={{ marginVertical: 20 }} /> : (
        <View style={styles.historyList}>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>Nenhuma série registrada.</Text>
          ) : (
            history.slice().reverse().slice(0, 5).map((item, index) => ( // Mostra apenas as últimas 5
              <View key={`history-${definitionId}-${index}`} style={styles.historyRow}>
                <Text style={styles.colDate}>{formatDate(item.workout_date)}</Text>
                <View style={styles.colData}>
                   <Text style={styles.dataText}>{item.weight}kg <Text style={styles.xText}>x</Text> {item.reps}</Text>
                   {item.is_pr && <Feather name="award" size={14} color="#D69E2E" style={{marginLeft: 6}} />}
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* FORMULÁRIO COM PREENCHIMENTO AUTOMÁTICO */}
      <QuickAddForm 
        definitionId={definitionId} 
        onSetAdded={loadHistory} 
        lastSet={lastSet} // Passamos a última série aqui
      />
    </View>
  );
};

type CatalogScreenProps = NativeStackScreenProps<RootStackParamList, 'ExerciseCatalog'>;

export default function ExerciseCatalogScreen({ navigation }: CatalogScreenProps) {
  const {
    loading, filteredExercises, handleCreateExercise, handleRenameExercise,
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

  // ... (Handlers de edição e menu mantidos iguais) ...
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
          const success = await handleRenameExercise(definitionId, newName.trim());
          if (success) setExpandedExercise(null);
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
            <View style={[styles.cardContainer, isExpanded && styles.cardExpanded]}>
              <TouchableOpacity style={styles.card} onPress={() => setExpandedExercise(prev => prev === item.exercise_id ? null : item.exercise_id)}>
                <View style={styles.cardContent}>
                   <Text style={styles.cardTitle}>{item.exercise_name_capitalized}</Text>
                   <Text style={styles.cardSubtitle}>
                      {item.total_sets > 0 ? `${item.total_sets} séries registradas` : 'Nunca realizado'}
                   </Text>
                </View>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={22} color="#A0AEC0" />
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
            <Text style={styles.modalTitle}>Instruções</Text>
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
  
  cardContainer: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cardExpanded: { borderColor: '#007AFF', borderWidth: 1 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cardContent: { flex: 1, marginRight: 10 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2D3748' },
  cardSubtitle: { fontSize: 12, color: '#718096', marginTop: 2 },

  ninhoContainer: { backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingBottom: 10 },
  
  ninhoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  ninhoHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ninhoHeaderTitle: { fontSize: 12, fontWeight: '600', color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5 },
  ninhoActions: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 4 },
  
  historyList: { marginHorizontal: 16, marginBottom: 12 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EDF2F7' },
  colDate: { fontSize: 13, color: '#718096', width: 80 },
  colData: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  dataText: { fontSize: 14, fontWeight: '600', color: '#2D3748' },
  xText: { fontSize: 12, color: '#CBD5E0', marginHorizontal: 4 },
  historyEmpty: { fontSize: 13, color: '#A0AEC0', textAlign: 'center', fontStyle: 'italic', paddingVertical: 10 },

  quickAddForm: { padding: 16, backgroundColor: '#EDF2F7', marginHorizontal: 16, marginBottom: 16, borderRadius: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#4A5568', marginBottom: 8, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  inputWrapper: { flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: '#718096', marginBottom: 4, marginLeft: 2 },
  input: { borderWidth: 1, borderColor: '#CBD5E0', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, fontSize: 16, backgroundColor: '#FFF', textAlign: 'center', color: '#1A202C' },
  
  buttonPrimary: { backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  buttonTextPrimary: { color: '#fff', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { backgroundColor: '#A9A9A9' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalSub: { fontSize: 13, color: '#718096', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#2D3748', marginBottom: 6 },
  textArea: { height: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  btnCancel: { backgroundColor: '#EDF2F7' },
  btnSave: { backgroundColor: '#007AFF' },
  txtCancel: { color: '#4A5568', fontWeight: '600' },
  txtSave: { color: '#FFF', fontWeight: '600' },
});