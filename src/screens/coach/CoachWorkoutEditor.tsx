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
import { SetType } from '@/types/workout';
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

// Import do Modal Unificado
import { ExerciseFeedbackModal } from '@/components/ExerciseFeedbackModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, 'CoachWorkoutEditor'>;

export default function CoachWorkoutEditor({ navigation, route }: Props) {
  const { workout, studentId: paramStudentId } = route.params;
  
  const [resolvedStudentId, setResolvedStudentId] = useState<string | undefined>(paramStudentId);

  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null); 

  const [isPickerVisible, setIsPickerVisible] = useState(false);
  
  // Estados para o Modal de Feedback
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [activeFeedbackDefId, setActiveFeedbackDefId] = useState<string | null>(null);
  const [activeFeedbackName, setActiveFeedbackName] = useState('');

  const { 
    searchTerm, 
    setSearchTerm, 
    filteredExercises,
    handleCreateExercise,
    allExercises 
  } = useExerciseCatalog();

  // Estados do Formulário Inline
  const [formSets, setFormSets] = useState('');
  const [formReps, setFormReps] = useState('');
  const [formRpe, setFormRpe] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSetType, setFormSetType] = useState<SetType>('normal');
  
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);

  // IA
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const ensureStudentId = async () => {
    if (resolvedStudentId) return;

    try {
      const { data, error } = await supabase
        .from('planned_workouts')
        .select('program:programs(student_id)')
        .eq('id', workout.id)
        .single();

      if (!error && data?.program) {
        // @ts-ignore
        const sId = data.program.student_id;
        if (sId) setResolvedStudentId(sId);
      }
    } catch (e) {
      console.log('Erro ao resolver studentId', e);
    }
  };

  const loadData = async () => {
    try {
      const data = await fetchPlannedExercises(workout.id);
      setExercises(data);
      await ensureStudentId();
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
        setFormSetType(item.set_type || 'normal');
      }
    }
  };

  const handleOpenFeedback = (definitionId: string, name: string) => {
    if (!resolvedStudentId) {
      Alert.alert('Aguarde', 'Identificando aluno vinculado...');
      ensureStudentId().then(() => {
         Alert.alert('Tente novamente', 'Vínculo restaurado.');
      });
      return;
    }
    setActiveFeedbackDefId(definitionId);
    setActiveFeedbackName(name);
    setFeedbackModalVisible(true);
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

  // [FUNCIONALIDADE REATIVADA]
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
        Alert.alert('Sucesso', `"${newExercise.exercise_name_capitalized}" adicionado.`);
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
        notes: formNotes,
        set_type: formSetType
      });
      setExercises(prev => prev.map(ex => ex.id === id ? {
        ...ex,
        sets_count: parseInt(formSets) || 0,
        reps_range: formReps,
        rpe_target: formRpe,
        notes: formNotes,
        set_type: formSetType
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
      Alert.alert('Erro', 'Falha ao salvar ordem.');
    } finally {
      setIsReordering(false);
    }
  };

  const handleAiImport = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    Keyboard.dismiss();

    try {
      const { data, error } = await supabase.functions.invoke('parse-workout', {
        body: { text: aiText }
      });

      if (error) throw error;
      if (!data || !data.data) throw new Error("Resposta inválida da IA");

      const responseData = data.data;
      let parsedExercises: any[] = [];

      if (responseData.days && Array.isArray(responseData.days)) {
         responseData.days.forEach((day: any) => {
            if (day.exercises && Array.isArray(day.exercises)) {
                parsedExercises = [...parsedExercises, ...day.exercises];
            }
         });
      } else if (Array.isArray(responseData)) {
         parsedExercises = responseData;
      }

      if (parsedExercises.length === 0) throw new Error("Nenhum exercício identificado.");

      let addedCount = 0;

      for (const ex of parsedExercises) {
        let defId = ex.definition_id;

        if (defId) {
           const existsLocally = allExercises.find(e => e.exercise_id === defId);
           if (!existsLocally) defId = null; 
        }

        if (!defId) {
          const newDef = await handleCreateExercise(ex.name, { silent: true });
          if (newDef) defId = newDef.exercise_id;
        }

        if (defId) {
          let detectedType: SetType = ex.set_type || 'normal';
          if (detectedType === 'normal') {
             const fullText = (ex.name + ' ' + (ex.notes || '')).toLowerCase();
             if (fullText.includes('drop')) detectedType = 'drop';
             else if (fullText.includes('warmup') || fullText.includes('aquec')) detectedType = 'warmup';
             else if (fullText.includes('rest pause') || fullText.includes('rest-pause')) detectedType = 'rest_pause';
             else if (fullText.includes('cluster')) detectedType = 'cluster';
          }

          await addPlannedExercise(
            workout.id, 
            defId, 
            exercises.length + addedCount,
            {
              sets: ex.sets,
              reps: ex.reps,
              rpe: ex.rpe,
              notes: ex.notes,
              set_type: detectedType
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
    const typeLabel = (t?: string) => {
        if (!t || t === 'normal') return null;
        if (t === 'drop') return 'DROP';
        if (t === 'rest_pause') return 'R-PAUSE';
        if (t === 'warmup') return 'AQUEC.';
        if (t === 'cluster') return 'CLUSTER';
        return t.toUpperCase();
    }

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
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.exName}>{item.definition?.name || 'Exercício'}</Text>
                    {item.set_type && item.set_type !== 'normal' && (
                        <View style={styles.miniBadge}>
                            <Text style={styles.miniBadgeText}>{typeLabel(item.set_type)}</Text>
                        </View>
                    )}
                </View>
                {!isExpanded && (
                  <Text style={styles.summaryText} numberOfLines={1}>
                    {item.sets_count || '?'} x {item.reps_range || '?'} {item.rpe_target ? `@ RPE ${item.rpe_target}` : ''}
                  </Text>
                )}
              </View>
            </View>
            
            <View style={styles.headerActions}>
                <TouchableOpacity 
                    style={styles.actionIconBtn} 
                    onPress={() => handleOpenFeedback(item.definition_id, item.definition?.name || '')}
                >
                    <Feather name="message-circle" size={20} color="#805AD5" />
                </TouchableOpacity>

                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#A0AEC0" />
            </View>
          </View>
          
          {isExpanded && (
            <View style={styles.editorBody}>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Séries</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formSets} onChangeText={setFormSets} placeholder="3" />
                </View>
                <View style={[styles.col, { flex: 2 }]}>
                  <Text style={styles.label}>Reps</Text>
                  <TextInput style={styles.input} value={formReps} onChangeText={setFormReps} placeholder="8-12" />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>RPE</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formRpe} onChangeText={setFormRpe} placeholder="8" />
                </View>
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>Técnica</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {(['normal', 'warmup', 'drop', 'rest_pause', 'cluster'] as SetType[]).map((type) => (
                    <TouchableOpacity
                        key={type}
                        onPress={() => setFormSetType(type)}
                        style={[styles.typeChip, formSetType === type && styles.typeChipActive]}
                    >
                        <Text style={[styles.typeChipText, formSetType === type && styles.typeChipTextActive]}>
                        {type === 'normal' ? 'Normal' : type === 'warmup' ? 'Aquec.' : type.toUpperCase().replace('_', ' ')}
                        </Text>
                    </TouchableOpacity>
                    ))}
                </View>
              </View>

              <Text style={styles.label}>Notas para este treino</Text>
              <TextInput 
                style={[styles.input, styles.textArea]} 
                multiline 
                placeholder="Ex: Focar na excêntrica..."
                value={formNotes}
                onChangeText={setFormNotes}
              />

              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                  <Feather name="trash-2" size={18} color="#E53E3E" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSaveInline(item.id)} style={styles.saveBtn} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" size="small"/> : <Text style={styles.saveText}>Salvar</Text>}
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
          ListEmptyComponent={<Text style={styles.emptyText}>Adicione exercícios para começar.</Text>}
        />
      )}

      <TouchableOpacity style={[styles.fab, styles.fabAi]} onPress={() => setIsAiModalVisible(true)}>
        <Feather name="cpu" size={24} color="#FFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.fab} onPress={() => setIsPickerVisible(true)}>
        <Feather name="plus" size={24} color="#FFF" />
      </TouchableOpacity>

      <ExerciseFeedbackModal
        visible={feedbackModalVisible}
        onClose={() => setFeedbackModalVisible(false)}
        definitionId={activeFeedbackDefId}
        exerciseName={activeFeedbackName}
        userId={resolvedStudentId || null} 
      />

      <Modal visible={isAiModalVisible} animationType="slide">
         <View style={styles.modalContainer}>
             <View style={{padding: 20, alignItems: 'flex-end'}}>
                <TouchableOpacity onPress={() => setIsAiModalVisible(false)}>
                    <Text style={{color: 'blue', fontSize: 16}}>Fechar</Text>
                </TouchableOpacity>
             </View>
             <View style={{padding: 20}}>
                <Text style={{fontSize: 18, fontWeight: 'bold', marginBottom: 10}}>Colar Treino (IA)</Text>
                <TextInput 
                    style={[styles.input, {height: 200, textAlignVertical: 'top'}]} 
                    multiline 
                    placeholder="Cole o treino aqui..." 
                    value={aiText}
                    onChangeText={setAiText}
                />
                <TouchableOpacity 
                    style={[styles.saveBtn, {marginTop: 20, alignItems: 'center'}]} 
                    onPress={handleAiImport}
                    disabled={aiLoading}
                >
                    {aiLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Processar</Text>}
                </TouchableOpacity>
             </View>
         </View>
      </Modal>

      <Modal visible={isPickerVisible} animationType="slide">
         <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Adicionar Exercício</Text>
                <TouchableOpacity onPress={() => setIsPickerVisible(false)}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.searchInput} placeholder="Buscar..." value={searchTerm} onChangeText={setSearchTerm} />
            <FlatList 
                data={filteredExercises} 
                keyExtractor={i => i.exercise_id} 
                renderItem={({item}) => (
                    <TouchableOpacity style={styles.pickerItem} onPress={() => handleAdd(item.exercise_id)}>
                        <Text style={styles.pickerItemText}>{item.exercise_name_capitalized}</Text>
                        <Feather name="plus-circle" size={24} color="#007AFF" />
                    </TouchableOpacity>
                )}
                // [NOVO] Componente para Criar Exercício se não encontrar ou se quiser forçar
                ListEmptyComponent={() => (
                  searchTerm.length > 2 ? (
                    <TouchableOpacity style={styles.createItem} onPress={handleCreateAndAdd} disabled={creatingNew}>
                       <View style={{flex: 1}}>
                         <Text style={styles.createItemTitle}>"{searchTerm}" não encontrado</Text>
                         <Text style={styles.createItemSub}>Toque aqui para criar e adicionar agora.</Text>
                       </View>
                       {creatingNew ? <ActivityIndicator color="#38A169" /> : <Feather name="plus-square" size={28} color="#38A169" />}
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.emptyPickerText}>Digite o nome do exercício...</Text>
                  )
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
  card: { backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EDF2F7', overflow: 'hidden' },
  cardActive: { borderColor: '#007AFF', backgroundColor: '#F0F9FF', elevation: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { fontSize: 16, fontWeight: '600', color: '#2D3748', flexShrink: 1 },
  summaryText: { fontSize: 13, color: '#718096', marginTop: 2 },
  miniBadge: { backgroundColor: '#EBF8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniBadgeText: { fontSize: 10, color: '#007AFF', fontWeight: 'bold' },
  
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionIconBtn: { padding: 4 },

  editorBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F7FAFC', paddingTop: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, color: '#718096', marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, fontSize: 15, color: '#2D3748', backgroundColor: '#F9FAFB' },
  textArea: { height: 60, textAlignVertical: 'top' },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF' },
  typeChipActive: { backgroundColor: '#EBF8FF', borderColor: '#007AFF' },
  typeChipText: { fontSize: 12, color: '#718096' },
  typeChipTextActive: { color: '#007AFF', fontWeight: 'bold' },
  cardActions: { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between', alignItems: 'center' },
  deleteBtn: { padding: 10, backgroundColor: '#FFF5F5', borderRadius: 8 },
  saveBtn: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', borderRadius: 28, elevation: 5 },
  fabAi: { bottom: 96, backgroundColor: '#805AD5' },
  
  pickerContainer: { flex: 1, backgroundColor: '#F7FAFC', paddingTop: 40 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  pickerTitle: { fontSize: 18, fontWeight: 'bold' },
  closeText: { color: '#007AFF', fontSize: 16 },
  searchInput: { margin: 16, marginTop: 0, backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EDF2F7', alignItems: 'center' },
  pickerItemText: { fontSize: 16, color: '#2D3748' },
  
  // [NOVO] Estilos do item de criação
  createItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FFF4', padding: 16, margin: 16, borderRadius: 12, borderWidth: 1, borderColor: '#C6F6D5' },
  createItemTitle: { fontSize: 16, fontWeight: '700', color: '#276749' },
  createItemSub: { fontSize: 13, color: '#2F855A' },
  emptyPickerText: { textAlign: 'center', marginTop: 40, color: '#A0AEC0', fontSize: 16 },

  modalContainer: { flex: 1, backgroundColor: '#F7FAFC' }
});