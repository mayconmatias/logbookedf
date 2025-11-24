import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList, // [CORREÇÃO 1] Importante para o Modal
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { PlannedExercise } from '@/types/coaching';
import { CatalogExerciseItem } from '@/types/catalog'; // [CORREÇÃO 2] Import do tipo
import { 
  fetchPlannedExercises, 
  addPlannedExercise, 
  updatePlannedExercise, 
  deletePlannedExercise,
  reorderPlannedExercises
} from '@/services/workout_planning.service';
import { useExerciseCatalog } from '@/hooks/useExerciseCatalog';
import DraggableFlatList, { 
  RenderItemParams, 
  ScaleDecorator 
} from 'react-native-draggable-flatlist';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachWorkoutEditor'>;

export default function CoachWorkoutEditor({ navigation, route }: Props) {
  const { workout } = route.params;
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);

  // --- ESTADOS DE SELEÇÃO (CATÁLOGO) ---
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const { 
    searchTerm, 
    setSearchTerm, 
    filteredExercises,
    handleCreateExercise
  } = useExerciseCatalog();

  // --- ESTADOS DE EDIÇÃO (PRESCRIÇÃO) ---
  const [editingExercise, setEditingExercise] = useState<PlannedExercise | null>(null);
  
  const [formSets, setFormSets] = useState('');
  const [formReps, setFormReps] = useState('');
  const [formRpe, setFormRpe] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchPlannedExercises(workout.id);
      setExercises(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ title: workout.name });
  }, [navigation, workout]);

  // --- AÇÕES ---

  const handleAdd = async (definitionId: string) => {
    setIsPickerVisible(false);
    setLoading(true);
    try {
      await addPlannedExercise(workout.id, definitionId, exercises.length);
      await loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!searchTerm || searchTerm.trim().length < 3) {
      Alert.alert('Atenção', 'O nome do exercício deve ter pelo menos 3 letras.');
      return;
    }

    setCreatingNew(true);
    try {
      const newExercise = await handleCreateExercise(searchTerm);
      
      if (newExercise) {
        await addPlannedExercise(workout.id, newExercise.exercise_id, exercises.length);
        setSearchTerm('');
        setIsPickerVisible(false);
        await loadData();
        Alert.alert('Sucesso', `"${newExercise.exercise_name_capitalized}" criado e adicionado!`);
      }
    } catch (e: any) {
      console.log(e);
    } finally {
      setCreatingNew(false);
    }
  };

  const openEditor = (ex: PlannedExercise) => {
    setEditingExercise(ex);
    setFormSets(ex.sets_count?.toString() || '');
    setFormReps(ex.reps_range || '');
    setFormRpe(ex.rpe_target || '');
    setFormNotes(ex.notes || '');
  };

  const handleSaveEdit = async () => {
    if (!editingExercise) return;
    setSaving(true);
    try {
      await updatePlannedExercise(editingExercise.id, {
        sets_count: parseInt(formSets) || 0,
        reps_range: formReps,
        rpe_target: formRpe,
        notes: formNotes
      });
      setEditingExercise(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Remover', 'Tirar este exercício do treino?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
          setLoading(true);
          await deletePlannedExercise(id);
          loadData();
      }}
    ]);
  };

  const onDragEnd = async ({ data }: { data: PlannedExercise[] }) => {
    setExercises(data);
    setIsReordering(true);

    const updates = data.map((ex, index) => ({
      id: ex.id,
      order: index,
    }));

    try {
      await reorderPlannedExercises(updates);
    } catch (e: any) {
      console.error('Erro reorder:', e.message);
      Alert.alert('Erro', 'Falha ao salvar nova ordem.');
    } finally {
      setIsReordering(false);
    }
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<PlannedExercise>) => (
    <ScaleDecorator>
      <TouchableOpacity 
        style={[styles.card, isActive && styles.cardActive]} 
        onPress={() => openEditor(item)}
        onLongPress={drag}
        delayLongPress={200}
        disabled={isActive}
      >
        <View style={styles.cardHeader}>
          <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
            <Feather name="more-horizontal" size={20} color="#CBD5E0" style={{ marginRight: 8 }} />
            <Text style={styles.exName}>{item.definition?.name || 'Exercício'}</Text>
          </View>

          <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: 4 }}>
            <Feather name="trash-2" size={18} color="#E53E3E" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Sets</Text>
            <Text style={styles.metaValue}>{item.sets_count || '-'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Reps</Text>
            <Text style={styles.metaValue}>{item.reps_range || '-'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>RPE</Text>
            <Text style={styles.metaValue}>{item.rpe_target || '-'}</Text>
          </View>
        </View>
        
        {item.notes ? (
          <Text style={styles.notes} numberOfLines={1}>obs: {item.notes}</Text>
        ) : null}
      </TouchableOpacity>
    </ScaleDecorator>
  );

  return (
    <View style={styles.container}>
      {loading && exercises.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <DraggableFlatList
          data={exercises}
          keyExtractor={item => item.id}
          onDragEnd={onDragEnd}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum exercício adicionado.</Text>}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setIsPickerVisible(true)}>
        <Feather name="plus" size={24} color="#FFF" />
        <Text style={styles.fabText}>Adicionar Exercício</Text>
      </TouchableOpacity>

      {/* --- MODAL 1: SELECIONAR EXERCÍCIO (PICKER) --- */}
      <Modal visible={isPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Escolher Exercício</Text>
            <TouchableOpacity onPress={() => setIsPickerVisible(false)}>
              <Text style={styles.closeText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar (ex: Supino)..."
            value={searchTerm}
            onChangeText={setSearchTerm}
          />

          {searchTerm.length > 0 && (
            <TouchableOpacity 
              style={styles.createItem} 
              onPress={handleCreateAndAdd}
              disabled={creatingNew}
            >
              <View style={{flex: 1}}>
                <Text style={styles.createItemTitle}>
                  Não encontrou "{searchTerm}"?
                </Text>
                <Text style={styles.createItemSubtitle}>
                  Toque aqui para criar e adicionar agora
                </Text>
              </View>
              {creatingNew ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Feather name="plus-square" size={24} color="#007AFF" />
              )}
            </TouchableOpacity>
          )}

          {/* [CORREÇÃO 3] Tipagem explícita no FlatList do Modal */}
          <FlatList
            data={filteredExercises}
            keyExtractor={(item: CatalogExerciseItem) => item.exercise_id}
            renderItem={({ item }: { item: CatalogExerciseItem }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => handleAdd(item.exercise_id)}>
                <Text style={styles.pickerItemText}>{item.exercise_name_capitalized}</Text>
                <Feather name="plus-circle" size={20} color="#007AFF" />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={!!editingExercise} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.editorCard}>
            <Text style={styles.editorTitle}>{editingExercise?.definition?.name}</Text>
            
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Séries</Text>
                <TextInput 
                  style={styles.input} 
                  keyboardType="numeric" 
                  value={formSets} 
                  onChangeText={setFormSets} 
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Reps (ex: 8-12)</Text>
                <TextInput 
                  style={styles.input} 
                  value={formReps} 
                  onChangeText={setFormReps} 
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>RPE</Text>
                <TextInput 
                  style={styles.input} 
                  keyboardType="numeric" 
                  value={formRpe} 
                  onChangeText={setFormRpe} 
                />
              </View>
            </View>

            <Text style={styles.label}>Observações / Notas</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              multiline 
              placeholder="Ex: Segurar 2s na descida"
              value={formNotes}
              onChangeText={setFormNotes}
            />

            <View style={styles.editorActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingExercise(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', padding: 16 },
  emptyText: { textAlign: 'center', color: '#A0AEC0', marginTop: 40 },
  
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  cardActive: {
    borderColor: '#007AFF',
    backgroundColor: '#EBF8FF',
    elevation: 10,
    shadowOpacity: 0.2
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  exName: { fontSize: 16, fontWeight: '700', color: '#2D3748', flex: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaItem: { alignItems: 'center', flex: 1 },
  metaLabel: { fontSize: 12, color: '#718096', marginBottom: 2 },
  metaValue: { fontSize: 16, fontWeight: '600', color: '#2D3748' },
  notes: { fontSize: 13, color: '#E53E3E', fontStyle: 'italic', marginTop: 4 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, elevation: 5
  },
  fabText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },

  pickerContainer: { flex: 1, backgroundColor: '#F7FAFC', paddingTop: 20 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
  pickerTitle: { fontSize: 18, fontWeight: 'bold' },
  closeText: { color: '#007AFF', fontSize: 16 },
  searchInput: { margin: 16, marginTop: 0, backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EDF2F7' },
  pickerItemText: { fontSize: 16, color: '#2D3748' },
  
  createItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EBF8FF',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BEE3F8'
  },
  createItemTitle: { fontWeight: 'bold', color: '#2B6CB0' },
  createItemSubtitle: { fontSize: 12, color: '#4A5568' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  editorCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20 },
  editorTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  col: { flex: 1 },
  label: { fontSize: 14, color: '#718096', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 16, color: '#2D3748' },
  textArea: { height: 80, textAlignVertical: 'top' },
  editorActions: { flexDirection: 'row', marginTop: 20, gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#EDF2F7', padding: 12, borderRadius: 8, alignItems: 'center' },
  saveBtn: { flex: 1, backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelText: { color: '#4A5568', fontWeight: '600' },
  saveText: { color: '#FFF', fontWeight: '600' },
});