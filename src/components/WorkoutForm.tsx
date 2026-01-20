import React, { memo, useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, 
  LayoutAnimation, Platform, UIManager, FlatList, ActivityIndicator,
  Keyboard
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SetType, PerformanceSet } from '@/types/workout';
import { LBS_TO_KG_FACTOR } from '@/utils/e1rm';
import { normalizeString } from '@/utils/text'; // Importando o novo utilitário

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getDaysAgoLabel = (dateStr?: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  date.setHours(0,0,0,0);
  now.setHours(0,0,0,0);
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'ontem';
  return `há ${diffDays} dias`;
};

// --- HEADER ---
interface ExerciseHeaderProps {
  label: string;
  definitionId: string | null;
  lastPerformance: PerformanceSet[];
  bestPerformance: PerformanceSet | null;
  inputUnit: 'kg' | 'lbs';
}

const ExerciseHeader = ({ 
  label, definitionId, lastPerformance, bestPerformance, inputUnit
}: ExerciseHeaderProps) => {
  const [showLastPerf, setShowLastPerf] = useState(false);

  const performanceHint = useMemo(() => {
    if (!definitionId) return null;
    const last = lastPerformance && lastPerformance.length > 0 ? lastPerformance[0] : null;
    const best = bestPerformance;
    
    if (!last && !best) return null;
    
    const target = showLastPerf ? (last || best) : (best || last);
    if (!target) return null;
    
    const typeLabel = showLastPerf ? 'Última' : 'Melhor';
    const daysLabel = getDaysAgoLabel(target.date || target.workout_date);

    let displayWeight = target.weight;
    let unitLabel = 'kg';

    if (inputUnit === 'lbs') {
      displayWeight = target.weight / LBS_TO_KG_FACTOR;
      unitLabel = 'lbs';
    }

    return {
      text: `${typeLabel}: ${displayWeight.toFixed(1)}${unitLabel} x ${target.reps} ${daysLabel}`,
      canToggle: !!(last && best && last !== best) 
    };
  }, [definitionId, lastPerformance, bestPerformance, showLastPerf, inputUnit]);

  return (
    <View style={styles.headerContainer}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {performanceHint && (
           <TouchableOpacity 
             onPress={() => performanceHint.canToggle && setShowLastPerf(!showLastPerf)} 
             activeOpacity={0.7}
             disabled={!performanceHint.canToggle}
             style={styles.hintContainer}
           >
             <Text style={styles.hintText}>{performanceHint.text}</Text>
             {performanceHint.canToggle && (
               <Feather name="refresh-ccw" size={10} color="#718096" style={{marginLeft: 4, opacity: 0.6}} />
             )}
           </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// --- INPUT ROW ---
interface InputRowProps {
  label: string; 
  valName: string; setValName: (v: string) => void;
  valW: string; setValW: (v: string) => void;
  valR: string; setValR: (v: string) => void;
  rpe?: string; setRpe?: (v: string) => void;
  
  definitionId: string | null;
  field: 'A' | 'B' | 'C';
  hasIcons: boolean;
  e1rmValue?: number;
  
  onFocusName: () => void;
  isAutocompleteFocused: boolean;
  suggestions: string[];
  onSelectSuggestion: (name: string) => void;
  onClearName?: () => void;

  onShowInstructions?: () => void;
  onShowInfo?: () => void;
  
  inputUnit: 'kg' | 'lbs';
  toggleInputUnit: () => void; 

  // Unilateral
  isUnilateral?: boolean;
  side?: 'E' | 'D' | null;
  onSelectSide?: (s: 'E' | 'D') => void;
}

const InputRow = memo((props: InputRowProps) => {
  const {
    label, valName, setValName, valW, setValW, valR, setValR, rpe, setRpe,
    definitionId, field, hasIcons, e1rmValue,
    onFocusName, isAutocompleteFocused, suggestions, onSelectSuggestion, onClearName,
    onShowInstructions, onShowInfo,
    inputUnit, toggleInputUnit,
    isUnilateral, side, onSelectSide
  } = props;

  const weightRef = useRef<TextInput>(null);
  const repsRef = useRef<TextInput>(null);
  const rpeRef = useRef<TextInput>(null);

  const displayUnit = typeof inputUnit === 'string' ? inputUnit.toUpperCase() : 'KG';

  // [CORREÇÃO BUG 2] Handler explícito para garantir a troca
  const handleSideSelect = (s: 'E' | 'D') => {
    if (onSelectSide) {
      onSelectSide(s);
    }
  };

  return (
    // [CORREÇÃO BUG 1] zIndex alto aqui garante que a lista flutue sobre os campos abaixo
    <View style={[styles.exerciseBlock, { zIndex: isAutocompleteFocused ? 1000 : 1 }]}>
      {/* LINHA DE NOME */}
      <View style={styles.inputRow}>
        <View style={{ flex: 1, position: 'relative' }}>
          <TextInput
            style={styles.inputName}
            placeholder={label}
            placeholderTextColor="#A0AEC0"
            value={valName}
            onChangeText={setValName}
            onFocus={onFocusName}
            onSubmitEditing={() => weightRef.current?.focus()} 
            returnKeyType="next"
            blurOnSubmit={false}
            autoCorrect={false} // [CORREÇÃO BUG 5] Desativa corretor para nomes técnicos
          />
          {valName.length > 0 && onClearName && (
            <TouchableOpacity onPress={onClearName} style={styles.clearBtn}>
              <Feather name="x" size={16} color="#A0AEC0" />
            </TouchableOpacity>
          )}
          
          {/* [CORREÇÃO BUG 1] Lista confinada e estilizada */}
          {isAutocompleteFocused && suggestions.length > 0 && (
            <View style={styles.listContainer}>
              <FlatList
                data={suggestions}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item, index) => `${item}-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => onSelectSuggestion(item)} style={styles.listItem}>
                    <Feather name="search" size={14} color="#CBD5E0" style={{marginRight: 8}}/>
                    <Text style={styles.listItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 220 }}
                nestedScrollEnabled={true}
              />
            </View>
          )}
        </View>

        {definitionId && hasIcons && (
          <View style={styles.actionIcons}>
            {onShowInstructions && (
              <TouchableOpacity onPress={onShowInstructions} style={styles.miniIconBtn}>
                <Feather name="message-circle" size={20} color="#4A5568" />
              </TouchableOpacity>
            )}
            {onShowInfo && (
              <TouchableOpacity onPress={onShowInfo} style={styles.miniIconBtn}>
                <Feather name="bar-chart-2" size={20} color="#007AFF" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* LINHA DE DADOS */}
      <View style={styles.dataRow}>
        <View style={styles.dataCol}>
          <Text style={styles.miniLabel}>Peso</Text>
          <View style={styles.inputGroup}>
            <TextInput
              ref={weightRef}
              style={[styles.inputData, { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
              placeholder="0"
              placeholderTextColor="#A0AEC0"
              keyboardType="decimal-pad"
              value={valW}
              onChangeText={setValW}
              returnKeyType="next"
              onSubmitEditing={() => repsRef.current?.focus()}
              blurOnSubmit={false}
            />
            <TouchableOpacity 
              style={styles.unitToggle} 
              onPress={() => toggleInputUnit()}
            >
              <Text style={styles.unitText}>{displayUnit}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dataCol}>
          <Text style={styles.miniLabel}>Reps</Text>
          <TextInput
            ref={repsRef}
            style={styles.inputData}
            placeholder="0"
            placeholderTextColor="#A0AEC0"
            keyboardType="numeric"
            value={valR}
            onChangeText={setValR}
            returnKeyType={rpe !== undefined ? "next" : "done"}
            onSubmitEditing={() => {
              if (rpe !== undefined && rpeRef.current) {
                rpeRef.current.focus();
              } else {
                Keyboard.dismiss();
              }
            }}
          />
        </View>

        <View style={styles.dataCol}>
          {rpe !== undefined && setRpe ? (
            <>
              <Text style={styles.miniLabel}>RPE</Text>
              <TextInput
                ref={rpeRef}
                style={styles.inputData}
                placeholder="-"
                placeholderTextColor="#A0AEC0"
                keyboardType="decimal-pad"
                value={rpe}
                onChangeText={setRpe}
              />
            </>
          ) : (
            <View style={styles.readOnlyBox}>
              <Text style={styles.miniLabel}>e1RM Est.</Text>
              <View style={styles.e1rmDisplay}>
                <Text style={styles.e1rmText}>
                  {e1rmValue && e1rmValue > 0 ? `${e1rmValue.toFixed(1)}` : '-'}
                </Text>
                <Text style={styles.unitSmall}>{inputUnit}</Text>
              </View>
            </View>
          )}
        </View>

        {/* SELETOR LATERAL INLINE */}
        {isUnilateral && onSelectSide && (
          <View style={[styles.dataCol, { flex: 0.8 }]}> 
             <Text style={styles.miniLabel}>Lado</Text>
             <View style={styles.sideToggleContainer}>
                <TouchableOpacity 
                   style={[styles.sideOption, side === 'E' && styles.sideOptionActive]}
                   onPress={() => handleSideSelect('E')}
                >
                   <Text style={[styles.sideOptionText, side === 'E' && styles.sideOptionTextActive]}>E</Text>
                </TouchableOpacity>
                <View style={styles.sideDivider}/>
                <TouchableOpacity 
                   style={[styles.sideOption, side === 'D' && styles.sideOptionActive]}
                   onPress={() => handleSideSelect('D')}
                >
                   <Text style={[styles.sideOptionText, side === 'D' && styles.sideOptionTextActive]}>D</Text>
                </TouchableOpacity>
             </View>
          </View>
        )}

      </View>
    </View>
  );
});

// --- MAIN FORM ---

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

  calculatedE1RMs: { A: number; B: number; C: number };
  
  e1rmDisplayTag?: string; 

  finalObservations: string; 
  observations: string; 
  setObservations: (obs: string) => void;

  subSets: { weight: string; reps: string }[];
  setSubSets: React.Dispatch<React.SetStateAction<{ weight: string; reps: string }[]>>;

  activeSetType: SetType;
  setActiveSetType: (type: SetType) => void;
  
  saving: boolean;
  handleSaveSet: () => void;   
  onSaveAndRest?: () => void;  
  
  allExerciseNames: string[];
  isAutocompleteFocused: boolean;
  setIsAutocompleteFocused: (isFocused: boolean) => void;
  
  handleShowInfoModal: (definitionId: string, name: string) => void; 
  onShowCoachInstructions?: (definitionId: string) => void;
  onClearExerciseName?: (field: 'A' | 'B' | 'C') => void;

  // Unilaterais A
  isUnilateral: boolean;
  setIsUnilateral: (v: boolean) => void;
  side: 'E' | 'D' | null;
  setSide: (side: 'E' | 'D' | null) => void;

  // Unilaterais B e C
  isUnilateralB: boolean;
  setIsUnilateralB: (v: boolean) => void;
  sideB: 'E' | 'D' | null;
  setSideB: (side: 'E' | 'D' | null) => void;

  isUnilateralC: boolean;
  setIsUnilateralC: (v: boolean) => void;
  sideC: 'E' | 'D' | null;
  setSideC: (side: 'E' | 'D' | null) => void;
  
  inputUnit: 'kg' | 'lbs';
  setInputUnit: () => void;
  toggleInputUnit: () => void;

  isEditing?: boolean;
  onCancelEdit?: () => void;

  perfA: { last: PerformanceSet[]; best: PerformanceSet | null; };
  perfB: { last: PerformanceSet[]; best: PerformanceSet | null; };
  perfC: { last: PerformanceSet[]; best: PerformanceSet | null; };

  isSubstitutionMode: boolean;
  substitutionOriginalName: string;
  onConfirmSubstitution?: () => void;
  onCancelSubstitution?: () => void;
}

export const WorkoutForm = memo((props: WorkoutFormProps) => {
  const {
    exerciseName, setExerciseName, weight, setWeight, reps, setReps, rpe, setRpe, definitionIdA,
    exerciseNameB, setExerciseNameB, weightB, setWeightB, repsB, setRepsB, definitionIdB,
    exerciseNameC, setExerciseNameC, weightC, setWeightC, repsC, setRepsC, definitionIdC,
    
    calculatedE1RMs,
    e1rmDisplayTag, 
    finalObservations, setObservations,
    subSets, setSubSets,
    allExerciseNames, isAutocompleteFocused, setIsAutocompleteFocused,
    onClearExerciseName, handleShowInfoModal, onShowCoachInstructions,
    inputUnit, setInputUnit, toggleInputUnit,
    activeSetType, setActiveSetType,
    saving, handleSaveSet, onSaveAndRest,
    isEditing, onCancelEdit,
    
    isUnilateral, side, setSide,
    isUnilateralB, sideB, setSideB,
    isUnilateralC, sideC, setSideC,

    perfA, perfB, perfC,

    isSubstitutionMode,
    substitutionOriginalName,
    onConfirmSubstitution,
    onCancelSubstitution
  } = props;

  const [focusedField, setFocusedField] = useState<'A' | 'B' | 'C' | null>(null);
  
  const handleObservationChange = (text: string) => {
    props.setObservations(text);
  };

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

  // [CORREÇÃO BUG 4] Filtro usando normalizeString
  const getFilteredSuggestions = (query: string) => {
    if (!query || query.length < 2) return [];
    
    const normalizedQuery = normalizeString(query);
    
    // [CORREÇÃO BUG 1] Slice(0, 5) para não estourar a tela
    return allExerciseNames
      .filter(n => normalizeString(n).includes(normalizedQuery))
      .slice(0, 5); 
  };

  const currentQuery = focusedField === 'A' ? exerciseName : (focusedField === 'B' ? exerciseNameB : exerciseNameC); 
  const suggestions = isAutocompleteFocused ? getFilteredSuggestions(currentQuery) : [];

  const handleSelectSuggestion = (name: string) => {
    if (focusedField === 'A') setExerciseName(name);
    else if (focusedField === 'B') setExerciseNameB(name);
    else if (focusedField === 'C') setExerciseNameC(name);
    
    setIsAutocompleteFocused(false);
    setFocusedField(null);
    Keyboard.dismiss();
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
  const isTriset = activeSetType === 'triset';

  const handleTypeChange = (type: SetType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveSetType(activeSetType === type ? 'normal' : type);
    setTimeout(() => {
        if (['drop', 'rest_pause', 'cluster'].includes(type) && subSets.length === 0) {
          setSubSets([{ weight: weight || '', reps: '' }]);
        }
        if (!['drop', 'rest_pause', 'cluster'].includes(type)) {
          setSubSets([]);
        }
    }, 0); 
  };

  return (
    <View style={[styles.form, { zIndex: isAutocompleteFocused ? 100 : 1 }]}>
      
      {isSubstitutionMode ? (
        <View style={styles.substitutionHeader}>
           <View style={styles.subInfo}>
              <Text style={styles.subTitle}>MODO SUBSTITUIÇÃO</Text>
              <Text style={styles.subDesc}>O exercício original será mantido no histórico como referência.</Text>
           </View>
           <TouchableOpacity onPress={onCancelSubstitution}>
              <Feather name="x-circle" size={24} color="#E53E3E" />
           </TouchableOpacity>
        </View>
      ) : isEditing && (
        <View style={styles.topControlRow}>
          <Text style={styles.editingLabel}>EDITANDO SÉRIE</Text>
          {onCancelEdit && (
             <TouchableOpacity onPress={onCancelEdit} style={styles.iconBtn}>
               <Text style={styles.cancelText}>Cancelar</Text>
             </TouchableOpacity>
          )}
        </View>
      )}

      {isSubstitutionMode && (
        <View style={styles.lockedBlock}>
           <Text style={styles.lockedLabel}>SAI:</Text>
           <Text style={styles.lockedName}>{substitutionOriginalName}</Text>
           <View style={styles.arrowCenter}>
              <Feather name="arrow-down" size={20} color="#805AD5" />
           </View>
        </View>
      )}

      {!isSubstitutionMode && (
        <ExerciseHeader 
          label="Exercício" 
          definitionId={definitionIdA}
          lastPerformance={perfA.last}
          bestPerformance={perfA.best}
          inputUnit={inputUnit}
        />
      )}

      <InputRow
        label={isSubstitutionMode ? "ENTRA: Buscar novo..." : "Buscar exercício..."}
        valName={exerciseName} setValName={setExerciseName}
        valW={weight} setValW={setWeight}
        valR={reps} setValR={setReps}
        rpe={(!isSuper && !isComplex) ? rpe : undefined} setRpe={(!isSuper && !isComplex) ? setRpe : undefined}
        e1rmValue={(isSuper || isComplex) ? calculatedE1RMs.A : undefined}
        
        definitionId={definitionIdA}
        field="A"
        hasIcons={!isSubstitutionMode} 
        onFocusName={() => handleFocus('A')}
        isAutocompleteFocused={isAutocompleteFocused && focusedField === 'A'}
        suggestions={suggestions}
        onSelectSuggestion={handleSelectSuggestion}
        onClearName={onClearExerciseName ? () => onClearExerciseName('A') : undefined}
        onShowInstructions={onShowCoachInstructions && definitionIdA ? () => onShowCoachInstructions(definitionIdA) : undefined}
        onShowInfo={handleShowInfoModal && definitionIdA ? () => handleShowInfoModal(definitionIdA, exerciseName) : undefined}
        inputUnit={inputUnit}
        toggleInputUnit={toggleInputUnit || (() => setInputUnit())}

        isUnilateral={isUnilateral}
        side={side}
        onSelectSide={setSide}
      />

      {/* BI-SET */}
      {!isSubstitutionMode && isSuper && (
        <>
          <View style={styles.separator} />
          <ExerciseHeader 
            label="2º Exercício (Bi-set)" 
            definitionId={definitionIdB}
            lastPerformance={perfB.last}
            bestPerformance={perfB.best}
            inputUnit={inputUnit}
          />
          <InputRow
            label="Buscar 2º exercício..."
            valName={exerciseNameB} setValName={setExerciseNameB}
            valW={weightB} setValW={setWeightB}
            valR={repsB} setValR={setRepsB}
            e1rmValue={calculatedE1RMs.B}
            
            definitionId={definitionIdB}
            field="B"
            hasIcons={true}
            onFocusName={() => handleFocus('B')}
            isAutocompleteFocused={isAutocompleteFocused && focusedField === 'B'}
            suggestions={suggestions}
            onSelectSuggestion={handleSelectSuggestion}
            onClearName={onClearExerciseName ? () => onClearExerciseName('B') : undefined}
            onShowInstructions={onShowCoachInstructions && definitionIdB ? () => onShowCoachInstructions(definitionIdB) : undefined}
            onShowInfo={handleShowInfoModal && definitionIdB ? () => handleShowInfoModal(definitionIdB, exerciseNameB) : undefined}
            inputUnit={inputUnit}
            toggleInputUnit={toggleInputUnit || (() => setInputUnit())}

            isUnilateral={isUnilateralB}
            side={sideB}
            onSelectSide={setSideB}
          />
        </>
      )}
      
      {/* TRI-SET */}
      {!isSubstitutionMode && isTriset && (
         <>
           <View style={styles.separator} />
           <ExerciseHeader 
            label="3º Exercício (Tri-set)" 
            definitionId={definitionIdC}
            lastPerformance={perfC.last}
            bestPerformance={perfC.best}
            inputUnit={inputUnit}
           />
           <InputRow
            label="Buscar 3º exercício..."
            valName={exerciseNameC} setValName={setExerciseNameC}
            valW={weightC} setValW={setWeightC}
            valR={repsC} setValR={setRepsC}
            e1rmValue={calculatedE1RMs.C}
            
            definitionId={definitionIdC}
            field="C"
            hasIcons={true}
            onFocusName={() => handleFocus('C')}
            isAutocompleteFocused={isAutocompleteFocused && focusedField === 'C'}
            suggestions={suggestions}
            onSelectSuggestion={handleSelectSuggestion}
            onClearName={onClearExerciseName ? () => onClearExerciseName('C') : undefined}
            onShowInstructions={onShowCoachInstructions && definitionIdC ? () => onShowCoachInstructions(definitionIdC) : undefined}
            onShowInfo={handleShowInfoModal && definitionIdC ? () => handleShowInfoModal(definitionIdC, exerciseNameC) : undefined}
            inputUnit={inputUnit}
            toggleInputUnit={toggleInputUnit || (() => setInputUnit())}

            isUnilateral={isUnilateralC}
            side={sideC}
            onSelectSide={setSideC}
          />
         </>
      )}

      {/* DROP-SET / CLUSTER */}
      {!isSubstitutionMode && isComplex && (
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
      {!isSubstitutionMode && (
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
      )}

      {/* OBSERVAÇÕES & HINT RM */}
      <View style={styles.footer}>
         <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 2}}>
            <Text style={styles.label}>Observações</Text>
            {/* [NOVO] Hint de e1RM para séries normais */}
            {e1rmDisplayTag && activeSetType === 'normal' ? (
               <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0F9FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#BEE3F8'}}>
                  <Feather name="trending-up" size={12} color="#3182CE" />
                  <Text style={{fontSize: 11, fontWeight: '700', color: '#2B6CB0'}}>
                    Est. {e1rmDisplayTag}
                  </Text>
               </View>
            ) : null}
         </View>
         
         <TextInput
           style={styles.obsInput}
           placeholder={isSubstitutionMode ? "Nota sobre a substituição..." : "Como sentiu a carga? (Salva no chat)"}
           placeholderTextColor="#A0AEC0"
           value={finalObservations} 
           onChangeText={handleObservationChange}
         />
      </View>

      {/* BOTÕES */}
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.buttonMain, isSubstitutionMode && { backgroundColor: '#805AD5' }]} 
          onPress={isSubstitutionMode ? onConfirmSubstitution : onSaveAndRest} 
          disabled={saving}
        >
           {saving ? <ActivityIndicator color="#FFF"/> : (
             <>
                <Feather name={isSubstitutionMode ? "check-circle" : "clock"} size={20} color="#FFF" />
                <Text style={styles.buttonText}>
                   {isSubstitutionMode ? 'CONFIRMAR SUBSTITUIÇÃO' : (isEditing ? 'ATUALIZAR' : 'SALVAR + DESCANSO')}
                </Text>
             </>
           )}
        </TouchableOpacity>
        
        {!isSubstitutionMode && (
          <TouchableOpacity style={styles.buttonSaveOnly} onPress={handleSaveSet} disabled={saving}>
            <Feather name="save" size={20} color="#4A5568" />
          </TouchableOpacity>
        )}
      </View>

    </View>
  );
});

const styles = StyleSheet.create({
  form: { 
    padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 2, borderColor: '#CBD5E0',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 
  },
  
  substitutionHeader: { 
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, 
    backgroundColor: '#FAF5FF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#D6BCFA' 
  },
  subInfo: { flex: 1 },
  subTitle: { color: '#6B46C1', fontWeight: '800', fontSize: 12 },
  subDesc: { color: '#553C9A', fontSize: 11, marginTop: 2 },
  
  lockedBlock: { 
    marginBottom: 12, padding: 12, backgroundColor: '#EDF2F7', 
    borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#A0AEC0' 
  },
  lockedLabel: { fontSize: 10, fontWeight: '700', color: '#718096' },
  lockedName: { fontSize: 16, fontWeight: '700', color: '#2D3748', marginTop: 2 },
  arrowCenter: { position: 'absolute', right: 12, top: 12 },

  headerContainer: { marginBottom: 6 },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#4A5568', textTransform: 'uppercase', letterSpacing: 0.5 },
  hintContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDF2F7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  hintText: { fontSize: 11, color: '#718096', fontWeight: '600' },
  sideToggleContainer: { flexDirection: 'row', alignItems: 'center', height: 44, borderWidth: 1.5, borderColor: '#A0AEC0', borderRadius: 8, backgroundColor: '#FFF', overflow: 'hidden' },
  sideOption: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%' },
  sideOptionActive: { backgroundColor: '#007AFF' },
  sideOptionText: { fontSize: 13, fontWeight: '700', color: '#A0AEC0' },
  sideOptionTextActive: { color: '#FFF' },
  sideDivider: { width: 1.5, height: '100%', backgroundColor: '#A0AEC0' },
  topControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  editingLabel: { fontSize: 12, fontWeight: '900', color: '#D69E2E', letterSpacing: 0.5 },
  cancelText: { color: '#E53E3E', fontSize: 12, fontWeight: '700' },
  iconBtn: { padding: 4 },
  exerciseBlock: { marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 },
  inputName: { flex: 1, borderWidth: 1.5, borderColor: '#A0AEC0', borderRadius: 8, padding: 10, paddingRight: 40, fontSize: 16, backgroundColor: '#FFFFFF', color: '#1A202C', fontWeight: '600', height: 44 },
  clearBtn: { position: 'absolute', right: 8, top: 10, padding: 4 },
  actionIcons: { flexDirection: 'row', gap: 8 },
  miniIconBtn: { padding: 8, backgroundColor: '#EDF2F7', borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E0', justifyContent: 'center', alignItems: 'center', height: 44, width: 44 },
  
  // [CORREÇÃO BUG 1] Estilos da Lista
  listContainer: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: '#FFFFFF', borderRadius: 8, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, zIndex: 9999, borderColor: '#E2E8F0', borderWidth: 1, maxHeight: 220 },
  listItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F7FAFC', flexDirection: 'row', alignItems: 'center' },
  listItemText: { fontSize: 15, color: '#2D3748', fontWeight: '500' },
  
  dataRow: { flexDirection: 'row', gap: 10 },
  dataCol: { flex: 1 },
  miniLabel: { fontSize: 11, fontWeight: '700', color: '#4A5568', marginBottom: 4, marginLeft: 2 },
  inputGroup: { flexDirection: 'row', alignItems: 'center' },
  inputData: { flex: 1, borderWidth: 1.5, borderColor: '#A0AEC0', borderRadius: 8, paddingVertical: 0, paddingHorizontal: 4, fontSize: 16, textAlign: 'center', backgroundColor: '#FFFFFF', color: '#1A202C', fontWeight: '600', height: 44 },
  unitToggle: { height: 44, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#E2E8F0', borderTopRightRadius: 8, borderBottomRightRadius: 8, borderWidth: 1.5, borderColor: '#A0AEC0', borderLeftWidth: 0 },
  unitText: { fontSize: 12, fontWeight: '800', color: '#4A5568' },
  separator: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 12 },
  readOnlyBox: { flex: 1 },
  e1rmDisplay: { height: 44, backgroundColor: '#F7FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  e1rmText: { fontSize: 16, fontWeight: '800', color: '#2D3748' },
  unitSmall: { fontSize: 10, color: '#A0AEC0', fontWeight: '600', marginTop: 4 },
  subSetsContainer: { backgroundColor: '#F7FAFC', padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#EDF2F7' },
  subSetsTitle: { fontSize: 12, fontWeight: '700', color: '#4A5568', marginBottom: 8 },
  subSetRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  connector: { width: 20, height: 24, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: '#CBD5E0', marginRight: 10, marginTop: -28, borderBottomLeftRadius: 12 },
  subInputGroup: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  addBtn: { backgroundColor: '#38A169', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, elevation: 2 },
  removeBtn: { backgroundColor: '#FFF5F5', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FEB2B2' },
  typeSelectorContainer: { marginBottom: 12, marginTop: 4, height: 32 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, borderColor: '#CBD5E0', backgroundColor: '#F7FAFC', marginRight: 4 },
  typeText: { fontSize: 12, fontWeight: '700', color: '#4A5568' },
  footer: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#4A5568', textTransform: 'uppercase', letterSpacing: 0.5 },
  obsInput: { borderWidth: 1.5, borderColor: '#CBD5E0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#F9FAFB', color: '#2D3748', height: 40 },
  buttonRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  buttonMain: { flex: 3, backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 4 },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  buttonSaveOnly: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E0', justifyContent: 'center', alignItems: 'center' },
});