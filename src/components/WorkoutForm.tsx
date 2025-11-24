import React, { useMemo, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from 'react-native';
import AutocompleteInput from 'react-native-autocomplete-input';
import { Feather } from '@expo/vector-icons';
import { PerformanceSet } from '@/types/workout';
import { LBS_TO_KG_FACTOR } from '@/utils/e1rm';

export interface WorkoutFormProps {
  exerciseName: string;
  setExerciseName: (name: string) => void;
  weight: string;
  setWeight: (weight: string) => void;
  reps: string;
  setReps: (reps: string) => void;
  rpe: string;
  setRpe: (rpe: string) => void;
  observations: string;
  setObservations: (obs: string) => void;
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
  templateHint: string; 
  isTemplateMode: boolean;
  isUnilateral: boolean;
  side: 'E' | 'D' | null;
  setSide: (side: 'E' | 'D' | null) => void;
  inputUnit: 'kg' | 'lbs';
  setInputUnit: React.Dispatch<React.SetStateAction<'kg' | 'lbs'>>;
  isEditing?: boolean;
  onCancelEdit?: () => void;
  onShowCoachInstructions?: () => void; 
  onClear?: () => void;
}

const WorkoutForm = memo(
  ({
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
    onSaveAndRest,
    allExerciseNames,
    isAutocompleteFocused,
    setIsAutocompleteFocused,
    loadingPerformance,
    lastPerformance,
    bestPerformance,
    handleShowInfoModal,
    templateHint,
    isTemplateMode,
    isUnilateral,
    side,
    setSide,
    inputUnit,
    setInputUnit,
    isEditing = false,
    onCancelEdit,
    onShowCoachInstructions,
    onClear,
  }: WorkoutFormProps) => {
    const filteredExercises = useMemo(() => {
      if (exerciseName === '' || !isAutocompleteFocused || isTemplateMode)
        return [];
      return allExerciseNames.filter((name: string) =>
        name.toLowerCase().includes(exerciseName.toLowerCase())
      );
    }, [exerciseName, allExerciseNames, isAutocompleteFocused, isTemplateMode]);

    const handleSelectExercise = (name: string) => {
      setExerciseName(name);
      setIsAutocompleteFocused(false);
    };

    const renderQuickHint = () => {
      if (loadingPerformance)
        return <Text style={styles.hintText}>Buscando...</Text>;
      if (!lastPerformance || lastPerformance.length === 0) return null;
      const firstSet = lastPerformance[0];
      let displayWeight = firstSet.weight.toFixed(1);
      let displayUnit = 'kg';
      if (inputUnit === 'lbs') {
        displayWeight = (firstSet.weight / LBS_TO_KG_FACTOR).toFixed(0);
        displayUnit = 'lbs';
      }
      return (
        <Text style={styles.hintText}>
          (Última: {displayWeight}{displayUnit} x {firstSet.reps})
        </Text>
      );
    };

    return (
      <View style={[styles.form, { zIndex: isAutocompleteFocused ? 100 : 1 }]}>
        
        <View style={styles.headerRow}>
          <Text style={styles.label}>
            {isEditing ? 'Editando Série' : 'Exercício'}
          </Text>
          
          {isEditing && onCancelEdit ? (
             <TouchableOpacity onPress={onCancelEdit} style={{ flexDirection: 'row', alignItems: 'center' }}>
               <Feather name="x" size={14} color="#FF3B30" />
               <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Cancelar Edição</Text>
             </TouchableOpacity>
          ) : (
             templateHint ? <Text style={styles.metaText}>{templateHint}</Text> : null
          )}
        </View>

        <View style={styles.inputWithIconsRow}>
           <View style={{ flex: 1, marginRight: 8, zIndex: 99 }}>
             <AutocompleteInput
              selectTextOnFocus={true} 
              style={[styles.input, (isTemplateMode || isEditing) && styles.inputDisabled]}
              placeholder="Ex.: Agachamento"
              value={exerciseName}
              data={filteredExercises}
              onChangeText={setExerciseName}
              onFocus={() => setIsAutocompleteFocused(true)}
              onBlur={() => setIsAutocompleteFocused(false)}
              editable={!isTemplateMode && !isEditing}
              returnKeyType="done"
              blurOnSubmit={true}
              flatListProps={{
                nestedScrollEnabled: true,
                keyboardShouldPersistTaps: 'always',
                keyExtractor: (item: string) => item,
                renderItem: ({ item }: { item: string }) => (
                  <TouchableOpacity onPress={() => handleSelectExercise(item)}>
                    <Text style={styles.listItem}>{item}</Text>
                  </TouchableOpacity>
                ),
                style: styles.listContainer,
              }}
              hideResults={!isAutocompleteFocused || filteredExercises.length === 0}
              inputContainerStyle={{ borderWidth: 0 }} 
              listContainerStyle={{ zIndex: 999 }}
            />

            {exerciseName.length > 0 && !isTemplateMode && !isEditing && (
              <TouchableOpacity 
                onPress={() => {
                  setExerciseName('');
                  setWeight('');
                  setReps('');
                  setRpe('');
                  if (onClear) onClear();
                }}
                style={styles.clearButton}
              >
                <Feather name="x-circle" size={18} color="#A0AEC0" />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 4 }}>
             {(lastPerformance.length > 0 || bestPerformance) && (
              <TouchableOpacity
                onPress={handleShowInfoModal}
                style={styles.iconButton}
                disabled={loadingPerformance}
              >
                <Feather
                  name="bar-chart-2"
                  size={24}
                  color={loadingPerformance ? '#ccc' : '#007AFF'}
                />
              </TouchableOpacity>
            )}

            {onShowCoachInstructions && (
              <TouchableOpacity
                onPress={onShowCoachInstructions}
                style={styles.iconButton}
              >
                <Feather
                  name="more-vertical"
                  size={24}
                  color="#D97706"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isUnilateral && (
          <View style={styles.sideSelectorContainer}>
            <TouchableOpacity
              style={[styles.sideButton, side === 'E' && styles.sideButtonSelected]}
              onPress={() => setSide(side === 'E' ? null : 'E')}
            >
              <Text style={[styles.sideButtonText, side === 'E' && styles.sideButtonTextSelected]}>
                Esquerdo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sideButton, side === 'D' && styles.sideButtonSelected]}
              onPress={() => setSide(side === 'D' ? null : 'D')}
            >
              <Text style={[styles.sideButtonText, side === 'D' && styles.sideButtonTextSelected]}>
                Direito
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputRow}>
          <View style={styles.inputColumn}>
            <Text style={styles.label}>Peso ({inputUnit})</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex.: 100"
              keyboardType="decimal-pad"
              returnKeyType="done"
              blurOnSubmit={true}
              value={weight}
              onChangeText={setWeight}
              selectTextOnFocus
            />
          </View>

          <View style={styles.inputColumn}>
            <Text style={styles.label}>Repetições</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex.: 5"
              keyboardType="numeric"
              returnKeyType="done"
              blurOnSubmit={true}
              value={reps}
              onChangeText={setReps}
              selectTextOnFocus
            />
          </View>

          <View style={styles.inputColumn}>
            <Text style={styles.label}>RPE (opc.)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex.: 7.5"
              keyboardType="decimal-pad"
              returnKeyType="done"
              blurOnSubmit={true}
              value={rpe}
              onChangeText={setRpe}
              selectTextOnFocus
            />
          </View>
        </View>

        <View style={styles.hintContainer}>{renderQuickHint()}</View>

        <View style={styles.switchContainer}>
          <Switch
            trackColor={{ false: '#E9E9EA', true: '#007AFF' }}
            thumbColor={'#FFFFFF'}
            ios_backgroundColor="#E9E9EA"
            onValueChange={(isOn) => setInputUnit(isOn ? 'lbs' : 'kg')}
            value={inputUnit === 'lbs'}
            style={{ transform: [{ scale: 0.4 }] }}
          />
          <Text style={styles.switchLabel}>
            {inputUnit === 'kg' ? 'kg' : 'lbs'}
          </Text>
        </View>

        <Text style={styles.label}>Observações (opcional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Técnica, dor, cadência..."
          multiline
          value={observations}
          onChangeText={setObservations}
        />

        {/* CONTÊINER DOS BOTÕES REORGANIZADOS */}
        <View style={styles.buttonRowContainer}>
          
          {/* 1. Botão ESQUERDA (Principal: Salvar + Timer) */}
          <TouchableOpacity
            style={[styles.buttonPrimary, { flex: 1 }]}
            onPress={onSaveAndRest}
            disabled={saving || loadingPerformance}
          >
             {saving ? (
               <ActivityIndicator color="#FFF"/> 
             ) : (
               <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Feather name="clock" size={18} color="#FFF" />
                  <Text style={styles.buttonTextPrimary}>
                    {isEditing ? 'Atualizar + Timer' : 'Salvar + Descanso'}
                  </Text>
               </View>
             )}
          </TouchableOpacity>

          {/* 2. Botão DIREITA (Secundário: Só Salvar) */}
          <TouchableOpacity
            style={[styles.buttonSecondary, { width: 100 }]}
            onPress={handleSaveSet}
            disabled={saving || loadingPerformance}
          >
            <Text style={styles.buttonTextSecondary}>
               {isEditing ? 'Só Atualizar' : 'Só Salvar'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  form: { 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee', 
    gap: 8, 
    backgroundColor: '#fff', 
    zIndex: 100, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 5, 
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'baseline', 
    marginBottom: 4 
  },
  label: { fontSize: 16, fontWeight: '600', color: '#333' },
  metaText: { fontSize: 13, fontWeight: '600', color: '#0284C7' },

  inputWithIconsRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 8,
    zIndex: 200, 
  },
  iconButton: { padding: 8, justifyContent: 'center', alignItems: 'center' },

  input: { borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, fontSize: 16, backgroundColor: '#fff' },
  inputDisabled: { backgroundColor: '#f5f5f5', color: '#777' },
  multiline: { height: 70, textAlignVertical: 'top' },
  
  listContainer: { 
    position: 'absolute', 
    top: 42, 
    left: 0, 
    right: 0, 
    maxHeight: 220, 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#ccc', 
    borderRadius: 8, 
    zIndex: 9999, 
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  listItem: { padding: 14, fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  
  clearButton: { position: 'absolute', right: 10, top: 12, padding: 4, zIndex: 300 },
  hintText: { fontSize: 14, color: '#555', fontStyle: 'italic' },
  hintContainer: { alignItems: 'flex-start', marginTop: -4, marginBottom: 4 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputColumn: { flex: 1, flexDirection: 'column' },
  switchContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -20, marginBottom: 0, marginLeft: -10, alignSelf: 'flex-start' },
  switchLabel: { fontSize: 14, fontWeight: '500', marginLeft: -15, color: '#999' },
  sideSelectorContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  sideButton: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#007AFF', borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
  sideButtonSelected: { backgroundColor: '#007AFF' },
  sideButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  sideButtonTextSelected: { color: '#fff' },
  
  // Botões
  buttonRowContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    alignItems: 'stretch',
  },
  buttonPrimary: { 
    backgroundColor: '#007AFF', 
    paddingVertical: 14, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  buttonSecondary: { 
    backgroundColor: '#F7FAFC', 
    paddingVertical: 14, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: '#E2E8F0' 
  },
  buttonTextSecondary: { color: '#4A5568', fontSize: 14, fontWeight: '600' },
  
  buttonDisabled: { backgroundColor: '#A9A9A9' },
});

export default WorkoutForm;