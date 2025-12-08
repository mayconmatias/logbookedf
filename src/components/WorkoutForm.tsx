import React, { memo, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, 
  LayoutAnimation, Platform, UIManager, ActivityIndicator, FlatList
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SetType, PerformanceSet } from '@/types/workout';
import { LBS_TO_KG_FACTOR } from '@/utils/e1rm';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutLayoutAnimationEnabledExperimental(true);
}

export interface WorkoutFormProps {
  exerciseName: string; setExerciseName: (name: string) => void;
  weight: string; setWeight: (weight: string) => void;
  reps: string; setReps: (reps: string) => void;
  rpe: string; setRpe: (rpe: string) => void;
  definitionIdA: string | null;

  exerciseNameB: string; setExerciseNameB: (name: string) => void;
  weightB: string; setWeightB: (w: string) => void;
  repsB: string; setRepsB: (r: string) => void;
  definitionIdB: string | null;

  exerciseNameC: string; setExerciseNameC: (name: string) => void;
  weightC: string; setWeightC: (w: string) => void;
  repsC: string; setRepsC: (r: string) => void;
  definitionIdC: string | null;

  subSets: { weight: string; reps: string }[];
  setSubSets: React.Dispatch<React.SetStateAction<{ weight: string; reps: string }[]>>;

  activeSetType: SetType;
  setActiveSetType: (type: SetType) => void;
  
  observations: string; setObservations: (obs: string) => void;
  saving: boolean;
  handleSaveSet: () => void;   
  onSaveAndRest?: () => void;  
  
  allExerciseNames: string[];
  isAutocompleteFocused: boolean;
  setIsAutocompleteFocused: (isFocused: boolean) => void;
  
  loadingPerformance: boolean;
  lastPerformance: PerformanceSet[];
  bestPerformance: PerformanceSet | null;
  handleShowInfoModal: () => void; 
  onShowCoachInstructions?: () => void;
  
  isUnilateral: boolean;
  side: 'E' | 'D' | null;
  setSide: (side: 'E' | 'D' | null) => void;
  inputUnit: 'kg' | 'lbs';
  setInputUnit: React.Dispatch<React.SetStateAction<'kg' | 'lbs'>>;
  
  isEditing?: boolean;
  onCancelEdit?: () => void;
  onClearExerciseName?: () => void;
}

// --------------------------------------------------------
// A ÚNICA MUDANÇA É AQUI, USANDO `export const` DIRETAMENTE
// --------------------------------------------------------
export const WorkoutForm = memo((props: WorkoutFormProps) => {
  const {
    exerciseName, setExerciseName, weight, setWeight, reps, setReps, rpe, setRpe, definitionIdA,
    exerciseNameB, setExerciseNameB, weightB, setWeightB, repsB, setRepsB,
    exerciseNameC, setExerciseNameC, weightC, setWeightC, repsC, setRepsC,
    subSets, setSubSets,
    allExerciseNames, isAutocompleteFocused, setIsAutocompleteFocused,
    onClearExerciseName, handleShowInfoModal, onShowCoachInstructions,
    inputUnit, setInputUnit, side, setSide, isUnilateral,
    activeSetType, setActiveSetType,
    observations, setObservations,
    saving, handleSaveSet, onSaveAndRest,
    isEditing, onCancelEdit
  } = props;

  const [focusedField, setFocusedField] = useState<'A' | 'B' | 'C' | null>(null);

  // --- SUBSET HANDLERS (mantidos) ---
  const handleAddSubSet = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSubSets([...subSets, { weight: weight || '', reps: '' }]);
  };
  
  const handleRemoveSubSet = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newSub = [...subSets];
    newSub.splice(index, 1);
    setSubSets(newSub);
  };
  
  const handleUpdateSubSet = (index: number, field: 'weight' | 'reps', val: string) => {
    setSubSets(prev => {
      const newS = [...prev];
      newS[index] = { ...newS[index], [field]: val };
      return newS;
    });
  };
  // --- FIM SUBSET HANDLERS ---


  const getFilteredSuggestions = (query: string) => {
    if (!query || query.length < 2) return [];
    return allExerciseNames.filter(n => n.toLowerCase().includes(query.toLowerCase()));
  };

  const currentQuery = focusedField === 'A' ? exerciseName : (focusedField === 'B' ? exerciseNameB : exerciseNameC); 
  const suggestions = isAutocompleteFocused ? getFilteredSuggestions(currentQuery) : [];

  const handleSelectSuggestion = (name: string) => {
    if (focusedField === 'A') setExerciseName(name);
    else if (focusedField === 'B') setExerciseNameB(name);
    else if (focusedField === 'C') setExerciseNameC(name);
    
    setIsAutocompleteFocused(false);
    setFocusedField(null);
  };

  const handleFocus = (field: 'A' | 'B' | 'C') => {
    setFocusedField(field);
    setIsAutocompleteFocused(true);
  };

  const SET_TYPES: { label: string, value: SetType, color: string }[] = [
     { label: 'Normal', value: 'normal', color: '#718096' },
     { label: 'Aquecimento', value: 'warmup', color: '#ECC94B' },
     { label: 'Drop-set', value: 'drop', color: '#E53E3E' },
     { label: 'Rest-Pause', value: 'rest_pause', color: '#805AD5' },
     { label: 'Cluster', value: 'cluster', color: '#319795' },
     { label: 'Bi-set', value: 'biset', color: '#DD6B20' },
     { label: 'Tri-set', value: 'triset', color: '#C05621' },
  ];

  const isComplex = ['drop', 'rest_pause', 'cluster'].includes(activeSetType);
  const isSuper = ['biset', 'triset'].includes(activeSetType);
  const isTriSet = activeSetType === 'triset';

  // [CORREÇÃO CRÍTICA] Aplicações de setTimeout para evitar o setState em render
  const handleTypeChange = (type: SetType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    // 1. Atualiza o tipo IMEDIATAMENTE (desbloqueia o render condicional)
    setActiveSetType(activeSetType === type ? 'normal' : type);
    
    // 2. Agenda a limpeza/setup de subSets para o PRÓXIMO ciclo de renderização
    setTimeout(() => {
        if (['drop', 'rest_pause', 'cluster'].includes(type) && subSets.length === 0) {
          setSubSets([{ weight: weight || '', reps: '' }]);
        }
        if (!['drop', 'rest_pause', 'cluster'].includes(type)) {
          setSubSets([]);
        }
    }, 0); 
  };

  const renderInputRow = (
    label: string, 
    valName: string, setValName: (v:string)=>void, 
    valW: string, setValW: (v:string)=>void, 
    valR: string, setValR: (v:string)=>void,
    field: 'A' | 'B' | 'C',
    hasIcons: boolean
  ) => (
    <View style={styles.exerciseBlock}>
      <View style={[styles.inputRow, { zIndex: focusedField === field ? 99 : 1 }]}>
          <View style={{ flex: 1, position: 'relative' }}>
            <TextInput
              style={styles.inputName}
              placeholder="Nome do exercício..."
              placeholderTextColor="#A0AEC0"
              value={valName}
              onChangeText={setValName}
              onFocus={() => handleFocus(field)}
              onBlur={() => setTimeout(() => setIsAutocompleteFocused(false), 200)}
            />
            {field === 'A' && valName.length > 0 && onClearExerciseName && (
              <TouchableOpacity onPress={onClearExerciseName} style={styles.clearBtn}>
                  <Feather name="x" size={16} color="#A0AEC0" />
              </TouchableOpacity>
            )}
            
            {isAutocompleteFocused && focusedField === field && suggestions.length > 0 && (
              <View style={styles.listContainer}>
                <FlatList
                  data={suggestions}
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={(item, index) => index.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity onPress={() => handleSelectSuggestion(item)} style={styles.listItem}>
                      <Text style={styles.listItemText}>{item}</Text>
                    </TouchableOpacity>
                  )}
                  style={{ maxHeight: 150 }}
                />
              </View>
            )}
          </View>
          
          {hasIcons && definitionIdA && (
            <View style={styles.actionIcons}>
              {onShowCoachInstructions && (
                <TouchableOpacity onPress={onShowCoachInstructions} style={styles.miniIconBtn}>
                  <Feather name="info" size={20} color="#4A5568" />
                </TouchableOpacity>
              )}
              {handleShowInfoModal && (
                <TouchableOpacity onPress={handleShowInfoModal} style={styles.miniIconBtn}>
                  <Feather name="bar-chart-2" size={20} color="#007AFF" />
                </TouchableOpacity>
              )}
            </View>
          )}
      </View>

      <View style={styles.dataRow}>
          <View style={styles.dataCol}>
            <Text style={styles.miniLabel}>Peso</Text>
            <View style={styles.inputGroup}>
               <TextInput
                 style={[styles.inputData, { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                 placeholder="0"
                 placeholderTextColor="#A0AEC0"
                 keyboardType="decimal-pad"
                 value={valW}
                 onChangeText={setValW}
               />
               <TouchableOpacity 
                 style={styles.unitToggle} 
                 onPress={() => props.setInputUnit(prev => prev === 'kg' ? 'lbs' : 'kg')}
               >
                 <Text style={styles.unitText}>{props.inputUnit.toUpperCase()}</Text>
               </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dataCol}>
            <Text style={styles.miniLabel}>Repetições</Text>
            <TextInput
              style={styles.inputData}
              placeholder="0"
              placeholderTextColor="#A0AEC0"
              keyboardType="numeric"
              value={valR}
              onChangeText={setValR}
            />
          </View>

          {/* RPE */}
          {field === 'A' && !isSuper && !isComplex && (
            <View style={styles.dataCol}>
              <Text style={styles.miniLabel}>RPE</Text>
              <TextInput
                  style={styles.inputData}
                  placeholder="-"
                  placeholderTextColor="#A0AEC0"
                  keyboardType="decimal-pad"
                  value={rpe}
                  onChangeText={setRpe}
                />
            </View>
          )}
      </View>
    </View>
  );

  return (
    <View style={[styles.form, { zIndex: isAutocompleteFocused ? 100 : 1 }]}>
      
      {isEditing && (
        <View style={styles.topControlRow}>
          <Text style={styles.editingLabel}>EDITANDO SÉRIE</Text>
          {onCancelEdit && (
             <TouchableOpacity onPress={onCancelEdit} style={styles.iconBtn}>
               <Text style={styles.cancelText}>Cancelar</Text>
             </TouchableOpacity>
          )}
        </View>
      )}

      {/* EXERCÍCIO PRINCIPAL (A) */}
      {renderInputRow('Exercício', exerciseName, setExerciseName, weight, setWeight, reps, setReps, 'A', true)}

      {/* BI-SET / TRI-SET (Exercícios B e C) */}
      {isSuper && (
        <>
          <View style={styles.separator} />
          {renderInputRow('Exercício 2', exerciseNameB, setExerciseNameB, weightB, setWeightB, repsB, setRepsB, 'B', false)}
          {activeSetType === 'triset' && (
             <>
               <View style={styles.separator} />
               {renderInputRow('Exercício 3', exerciseNameC, setExerciseNameC, weightC, setWeightC, repsC, setRepsC, 'C', false)}
             </>
          )}
        </>
      )}

      {/* DROP-SET / CLUSTER (Sub-sets) */}
      {isComplex && (
        <View style={styles.subSetsContainer}>
          <Text style={styles.subSetsTitle}>Séries Adicionais (Drops/Pausas)</Text>
          {subSets.map((sub, idx) => (
            <View key={idx} style={styles.subSetRow}>
               <View style={styles.connector} />
               
               <View style={styles.subInputGroup}>
                   <TextInput 
                     style={[styles.inputData, { flex: 1 }]} 
                     placeholder={`Peso (${inputUnit})`}
                     placeholderTextColor="#A0AEC0"
                     keyboardType="decimal-pad"
                     value={sub.weight}
                     onChangeText={(t) => handleUpdateSubSet(idx, 'weight', t)}
                   />
                   <TextInput 
                     style={[styles.inputData, { flex: 1 }]} 
                     placeholder="Reps" 
                     placeholderTextColor="#A0AEC0"
                     keyboardType="numeric"
                     value={sub.reps}
                     onChangeText={(t) => handleUpdateSubSet(idx, 'reps', t)}
                   />
                   
                   {idx === subSets.length - 1 ? (
                     <TouchableOpacity onPress={handleAddSubSet} style={styles.addBtn}>
                       <Feather name="plus" size={20} color="#FFF" />
                     </TouchableOpacity>
                   ) : (
                     <TouchableOpacity onPress={() => handleRemoveSubSet(idx)} style={styles.removeBtn}>
                       <Feather name="x" size={18} color="#E53E3E" />
                     </TouchableOpacity>
                   )}
               </View>
            </View>
          ))}
        </View>
      )}

      {/* TIPO DE SÉRIE */}
      <View style={styles.typeSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
           {SET_TYPES.map(type => (
             <TouchableOpacity 
               key={type.value}
               style={[
                 styles.typeChip, 
                 activeSetType === type.value && { backgroundColor: type.color, borderColor: type.color }
               ]}
               onPress={() => handleTypeChange(type.value)}
             >
               <Text style={[styles.typeText, activeSetType === type.value && { color: '#FFF' }]}>
                 {type.label}
               </Text>
             </TouchableOpacity>
           ))}
        </ScrollView>
      </View>

      {/* OBSERVAÇÕES */}
      <View style={styles.footer}>
         <TextInput
           style={styles.obsInput}
           placeholder="Observações (opcional)..."
           placeholderTextColor="#A0AEC0"
           value={observations}
           onChangeText={setObservations}
         />
      </View>

      {/* BOTÕES DE AÇÃO */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.buttonMain} onPress={onSaveAndRest} disabled={saving}>
           {saving ? <ActivityIndicator color="#FFF"/> : (
             <>
                <Feather name="clock" size={20} color="#FFF" />
                <Text style={styles.buttonText}>
                   {isEditing ? 'ATUALIZAR' : 'SALVAR + DESCANSO'}
                </Text>
             </>
           )}
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.buttonSaveOnly} onPress={handleSaveSet} disabled={saving}>
          <Feather name="save" size={20} color="#4A5568" />
        </TouchableOpacity>
      </View>

    </View>
  );
});

// A exportação final foi removida porque a exportação é feita na declaração acima.
// Isso elimina qualquer chance de conflito de default/named export.

const styles = StyleSheet.create({
  form: { 
    padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 2, borderColor: '#CBD5E0',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 
  },
  
  // Topo Edição
  topControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  editingLabel: { fontSize: 12, fontWeight: '900', color: '#D69E2E', letterSpacing: 0.5 },
  cancelText: { color: '#E53E3E', fontSize: 12, fontWeight: '700' },
  iconBtn: { padding: 4 },

  // Blocos
  exerciseBlock: { marginBottom: 12 },
  
  // Labels e Hints
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '800', color: '#2D3748' }, 
  hintText: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  loadingText: { fontSize: 12, color: '#A0AEC0' },

  // Inputs
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 },
  inputName: { 
    flex: 1, borderWidth: 1.5, borderColor: '#A0AEC0', borderRadius: 8, padding: 10, paddingRight: 40, 
    fontSize: 16, backgroundColor: '#FFFFFF', color: '#1A202C', fontWeight: '600', height: 44 
  },
  clearBtn: { position: 'absolute', right: 8, top: 10, padding: 4 },
  
  // Ações ao lado do nome
  actionIcons: { flexDirection: 'row', gap: 8 },
  miniIconBtn: { 
    padding: 8, backgroundColor: '#EDF2F7', borderRadius: 8, 
    borderWidth: 1, borderColor: '#CBD5E0', justifyContent: 'center', alignItems: 'center', height: 44, width: 44
  },
  
  // Autocomplete
  listContainer: { 
    position: 'absolute', top: 46, left: 0, right: 0, 
    backgroundColor: '#FFFFFF', borderRadius: 8, elevation: 20, zIndex: 9999,
    borderColor: '#A0AEC0', borderWidth: 1, maxHeight: 180
  },
  listItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  listItemText: { fontSize: 15, color: '#2D3748', fontWeight: '500' },

  // Dados (Peso/Reps/RPE)
  dataRow: { flexDirection: 'row', gap: 10 },
  dataCol: { flex: 1 },
  miniLabel: { fontSize: 11, fontWeight: '700', color: '#4A5568', marginBottom: 4, marginLeft: 2 },
  
  inputGroup: { flexDirection: 'row', alignItems: 'center' },
  inputData: { 
    flex: 1, borderWidth: 1.5, borderColor: '#A0AEC0', borderRadius: 8, paddingVertical: 0, paddingHorizontal: 4,
    fontSize: 16, textAlign: 'center', backgroundColor: '#FFFFFF', color: '#1A202C', fontWeight: '600', height: 44 
  },
  
  unitToggle: { 
    height: 44, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#E2E8F0',
    borderTopRightRadius: 8, borderBottomRightRadius: 8, borderWidth: 1.5, borderColor: '#A0AEC0', borderLeftWidth: 0 
  },
  unitText: { fontSize: 12, fontWeight: '800', color: '#4A5568' },

  sideGroup: { flexDirection: 'row', height: 44, backgroundColor: '#E2E8F0', borderRadius: 8, padding: 4, borderWidth: 1, borderColor: '#CBD5E0' },
  sideBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  sideBtnActive: { backgroundColor: '#007AFF' },
  sideText: { fontSize: 12, fontWeight: '800', color: '#4A5568' },

  // Separator para Bi-sets
  separator: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 12 },

  // Drops/Cluster
  verticalContainer: { marginLeft: 16, marginBottom: 12, marginTop: 4 },
  subSetsContainer: { backgroundColor: '#F7FAFC', padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#EDF2F7' },
  subSetsTitle: { fontSize: 12, fontWeight: '700', color: '#4A5568', marginBottom: 8 },
  subSetRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  connector: { 
    width: 20, height: 24, borderLeftWidth: 3, borderBottomWidth: 3, 
    borderColor: '#CBD5E0', marginRight: 10, marginTop: -28, borderBottomLeftRadius: 12
  },
  subInputGroup: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  addBtn: { backgroundColor: '#38A169', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, elevation: 2 },
  removeBtn: { backgroundColor: '#FFF5F5', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FEB2B2' },

  // Bi/Tri-set visual links
  superSetBlock: { marginTop: 4, marginBottom: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8 },
  superSetHeader: { alignItems: 'center', height: 16, justifyContent: 'center', marginBottom: 4 },
  linkLine: { position: 'absolute', width: '100%', height: 2, backgroundColor: '#CBD5E0' },
  linkIcon: { backgroundColor: '#FFF', paddingHorizontal: 12 },

  // Tipos
  typeSelectorContainer: { marginBottom: 12, marginTop: 4, height: 32 },
  typeChip: { 
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, 
    borderWidth: 1.5, borderColor: '#CBD5E0', backgroundColor: '#F7FAFC', marginRight: 4 
  },
  typeText: { fontSize: 12, fontWeight: '700', color: '#4A5568' },
  
  // Footer
  footer: { marginBottom: 16 },
  obsInput: { 
    borderWidth: 1.5, borderColor: '#CBD5E0', borderRadius: 8, padding: 10, 
    fontSize: 14, backgroundColor: '#F9FAFB', color: '#2D3748', height: 40
  },

  // Botões Principais
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  buttonMain: { 
    flex: 3, backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, 
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 4
  },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  
  buttonSaveOnly: { 
    flex: 1, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 2, 
    borderColor: '#CBD5E0', justifyContent: 'center', alignItems: 'center'
  },
});