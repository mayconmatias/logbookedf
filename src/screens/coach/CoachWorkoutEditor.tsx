import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  Keyboard 
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { PlannedExercise } from '@/types/coaching';
import { CatalogExerciseItem } from '@/types/catalog';
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
import { supabase } from '@/lib/supabaseClient'; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'CoachWorkoutEditor'>;

export default function CoachWorkoutEditor({ navigation, route }: Props) {
  const { workout } = route.params;
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null); 

  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const { 
    searchTerm, 
    setSearchTerm, 
    filteredExercises,
    handleCreateExercise,
    allExercises 
  } = useExerciseCatalog();

  const [formSets, setFormSets] = useState('');
  const [formReps, setFormReps] = useState('');
  const [formRpe, setFormRpe] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

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

  useEffect(() => { loadData(); }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ title: workout.name });
  }, [navigation, workout]);

  const toggleExpand = (id: string, item?: PlannedExercise) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (item) {
        setFormSets(item.sets_count?.toString() || '');
        setFormReps(item.reps_range || '');
        setFormRpe(item.rpe_target || '');
        setFormNotes(item.notes || '');
      }
    }
  };

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
      const newExercise = await handleCreateExercise(searchTerm, { silent: true });
      
      if (newExercise) {
        await addPlannedExercise(workout.id, newExercise.exercise_id, exercises.length);
        setSearchTerm('');
        setIsPickerVisible(false);
        await loadData();
        Alert.alert('Sucesso', `"${newExercise.exercise_name_capitalized}" adicionado ao treino.`);
      }
    } catch (e: any) {
      console.log(e);
    } finally {
      setCreatingNew(false);
    }
  };

  const handleSaveInline = async (id: string) => {
    setSaving(true);
    try {
      await updatePlannedExercise(id, {
        sets_count: parseInt(formSets) || 0,
        reps_range: formReps,
        rpe_target: formRpe,
        notes: formNotes
      });
      setExercises(prev => prev.map(ex => ex.id === id ? {
        ...ex,
        sets_count: parseInt(formSets) || 0,
        reps_range: formReps,
        rpe_target: formRpe,
        notes: formNotes
      } : ex));
      
      toggleExpand(id);
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
    const updates = data.map((ex, index) => ({ id: ex.id, order: index }));
    try {
      await reorderPlannedExercises(updates);
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao salvar nova ordem.');
    } finally {
      setIsReordering(false);
    }
  };

  // --- FUNÇÃO DE IA (ATUALIZADA) ---
  const handleAiImport = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    Keyboard.dismiss();

    try {
      const { data, error } = await supabase.functions.invoke('parse-workout', {
        body: { text: aiText }
      });

      if (error) throw error;
      if (!data || !data.data || !Array.isArray(data.data)) throw new Error("Resposta inválida da IA");

      const parsedExercises = data.data;
      let addedCount = 0;

      for (const ex of parsedExercises) {
        let defId = ex.definition_id;

        // Validação de Segurança (ID existe?)
        if (defId) {
           const existsLocally = allExercises.find(e => e.exercise_id === defId);
           if (!existsLocally) {
              defId = null; 
           }
        }

        // Se não tem ID válido, cria o exercício
        if (!defId) {
          const newDef = await handleCreateExercise(ex.name, { silent: true });
          if (newDef) defId = newDef.exercise_id;
        }

        if (defId) {
          // [CORREÇÃO] Passamos os dados extraídos (sets, reps, rpe) para o service
          await addPlannedExercise(
            workout.id, 
            defId, 
            exercises.length + addedCount,
            {
              sets: ex.sets,
              reps: ex.reps,
              rpe: ex.rpe,
              notes: ex.notes
            }
          );
          
          addedCount++;
        }
      }

      Alert.alert('Sucesso', `${addedCount} exercícios adicionados!`);
      setAiText('');
      setIsAiModalVisible(false);
      await loadData();

    } catch (e: any) {
      Alert.alert('Erro na IA', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<PlannedExercise>) => {
    const isExpanded = expandedId === item.id;

    return (
      <ScaleDecorator>
        <TouchableOpacity 
          style={[styles.card, isActive && styles.cardActive]} 
          onPress={() => toggleExpand(item.id, item)}
          onLongPress={drag}
          delayLongPress={200}
          disabled={isActive}
          activeOpacity={0.9}
        >
          <View style={styles.cardHeader}>
            <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
              <Feather name="menu" size={20} color="#CBD5E0" style={{ marginRight: 12 }} />
              <View>
                <Text style={styles.exName}>{item.definition?.name || 'Exercício'}</Text>
                {!isExpanded && (
                  <Text style={styles.summaryText}>
                    {item.sets_count || '?'} x {item.reps_range || '?'} {item.rpe_target ? `@ RPE ${item.rpe_target}` : ''}
                  </Text>
                )}
              </View>
            </View>
            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#A0AEC0" />
          </View>
          
          {isExpanded && (
            <View style={styles.editorBody}>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Séries</Text>
                  <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={formSets} 
                    onChangeText={setFormSets}
                    placeholder="3" 
                  />
                </View>
                <View style={[styles.col, { flex: 2 }]}>
                  <Text style={styles.label}>Reps (ex: 8-12)</Text>
                  <TextInput 
                    style={styles.input} 
                    value={formReps} 
                    onChangeText={setFormReps}
                    placeholder="8-12" 
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>RPE</Text>
                  <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={formRpe} 
                    onChangeText={setFormRpe}
                    placeholder="8" 
                  />
                </View>
              </View>

              <Text style={styles.label}>Notas</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                multiline 
                placeholder="Detalhes técnicos..."
                value={formNotes}
                onChangeText={setFormNotes}
              />

              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                  <Feather name="trash-2" size={18} color="#E53E3E" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={() => handleSaveInline(item.id)} 
                  style={styles.saveBtn}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#FFF" size="small"/> : <Text style={styles.saveText}>Salvar Alterações</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      {loading && exercises.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <DraggableFlatList
          data={exercises}
          keyExtractor={item => item.id}
          onDragEnd={onDragEnd}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Toque em "+" ou use a IA para adicionar exercícios.</Text>}
        />
      )}

      <TouchableOpacity 
        style={[styles.fab, styles.fabAi]} 
        onPress={() => setIsAiModalVisible(true)}
      >
        <Feather name="cpu" size={24} color="#FFF" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.fab} onPress={() => setIsPickerVisible(true)}>
        <Feather name="plus" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL DE IA */}
      <Modal visible={isAiModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
           <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Prescrição Inteligente</Text>
              <TouchableOpacity onPress={() => setIsAiModalVisible(false)}>
                <Text style={styles.closeText}>Cancelar</Text>
              </TouchableOpacity>
           </View>
           <View style={{padding: 16, flex: 1}}>
              <Text style={styles.modalSub}>
                 Cole seu treino abaixo (do WhatsApp, Bloco de Notas, etc). A IA vai identificar os exercícios e adicionar à lista.
              </Text>
              <TextInput 
                 style={styles.aiInput}
                 multiline
                 placeholder="Ex: Supino Reto 3x10, Agachamento 4x8..."
                 value={aiText}
                 onChangeText={setAiText}
                 autoFocus
              />
              <TouchableOpacity 
                style={styles.aiButton} 
                onPress={handleAiImport}
                disabled={aiLoading}
              >
                 {aiLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.aiButtonText}>Processar Treino</Text>}
              </TouchableOpacity>
           </View>
        </View>
      </Modal>

      {/* MODAL DE SELEÇÃO */}
      <Modal visible={isPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Adicionar Exercício</Text>
            <TouchableOpacity onPress={() => setIsPickerVisible(false)}>
              <Text style={styles.closeText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar exercício..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            autoFocus
          />

          {searchTerm.length > 0 && (
            <TouchableOpacity 
              style={styles.createItem} 
              onPress={handleCreateAndAdd}
              disabled={creatingNew}
            >
              <View style={{flex: 1}}>
                <Text style={styles.createItemTitle}>Criar "{searchTerm}"</Text>
                <Text style={styles.createItemSubtitle}>Adicionar ao catálogo e ao treino</Text>
              </View>
              {creatingNew ? <ActivityIndicator color="#007AFF" /> : <Feather name="plus" size={20} color="#007AFF" />}
            </TouchableOpacity>
          )}

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', padding: 16 },
  emptyText: { textAlign: 'center', color: '#A0AEC0', marginTop: 40 },
  
  card: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    borderWidth: 1, borderColor: '#EDF2F7',
    overflow: 'hidden'
  },
  cardActive: { borderColor: '#007AFF', backgroundColor: '#F0F9FF', elevation: 5 },
  
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { fontSize: 16, fontWeight: '600', color: '#2D3748' },
  summaryText: { fontSize: 13, color: '#718096', marginTop: 2 },

  editorBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F7FAFC', paddingTop: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, color: '#718096', marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, fontSize: 15, color: '#2D3748', backgroundColor: '#F9FAFB' },
  textArea: { height: 60, textAlignVertical: 'top' },
  
  cardActions: { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between', alignItems: 'center' },
  deleteBtn: { padding: 10, backgroundColor: '#FFF5F5', borderRadius: 8 },
  saveBtn: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    borderRadius: 28, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4
  },
  fabAi: {
    bottom: 96, 
    backgroundColor: '#805AD5',
  },

  pickerContainer: { flex: 1, backgroundColor: '#F7FAFC', paddingTop: 10 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
  pickerTitle: { fontSize: 18, fontWeight: 'bold' },
  closeText: { color: '#007AFF', fontSize: 16 },
  searchInput: { margin: 16, marginTop: 0, backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16 },
  
  createItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EBF8FF', marginHorizontal: 16, marginBottom: 10, padding: 12,
    borderRadius: 8, borderWidth: 1, borderColor: '#BEE3F8'
  },
  createItemTitle: { fontWeight: 'bold', color: '#2B6CB0' },
  createItemSubtitle: { fontSize: 12, color: '#4A5568' },
  
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EDF2F7' },
  pickerItemText: { fontSize: 16, color: '#2D3748' },

  modalContainer: { flex: 1, backgroundColor: '#F7FAFC' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  modalSub: { fontSize: 14, color: '#718096', marginBottom: 16 },
  aiInput: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, fontSize: 16, textAlignVertical: 'top', marginBottom: 16 },
  aiButton: { backgroundColor: '#805AD5', padding: 16, borderRadius: 12, alignItems: 'center' },
  aiButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});