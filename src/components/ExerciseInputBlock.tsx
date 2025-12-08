import React, { memo } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import ExerciseStatsHint from './ExerciseStatsHint'; // Certifique-se de ter criado este ou remova se ainda não tiver

interface Props {
  label: string;
  exerciseName: string;
  onNameChange: (val: string) => void;
  
  weight: string;
  onWeightChange: (val: string) => void;
  
  reps: string;
  onRepsChange: (val: string) => void;

  definitionId: string | null;
  inputUnit: 'kg' | 'lbs';
  
  // Autocomplete
  isFocused: boolean;
  onFocus: () => void;
  suggestions: string[];
  onSelectSuggestion: (name: string) => void;
}

const ExerciseInputBlock = memo((props: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{props.label}</Text>
        {/* Se você ainda não criou o ExerciseStatsHint, pode comentar a linha abaixo temporariamente */}
        {/* <ExerciseStatsHint definitionId={props.definitionId} inputUnit={props.inputUnit} /> */}
      </View>

      {/* Nome do Exercício */}
      <View style={{ zIndex: 99, marginBottom: 8 }}>
        <TextInput
          style={styles.input}
          placeholder="Nome do exercício..."
          placeholderTextColor="#A0AEC0"
          value={props.exerciseName}
          onChangeText={props.onNameChange}
          onFocus={props.onFocus}
        />
        {props.isFocused && props.suggestions.length > 0 && (
          <View style={styles.listContainer}>
            <FlatList
              data={props.suggestions}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => props.onSelectSuggestion(item)} style={styles.listItem}>
                  <Text style={styles.listItemText}>{item}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 120 }}
            />
          </View>
        )}
      </View>

      {/* Peso e Reps (Lado a Lado) */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.subLabel}>Peso ({props.inputUnit})</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#A0AEC0"
            keyboardType="decimal-pad"
            value={props.weight}
            onChangeText={props.onWeightChange}
          />
        </View>
        <View style={styles.col}>
          <Text style={styles.subLabel}>Repetições</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#A0AEC0"
            keyboardType="numeric"
            value={props.reps}
            onChangeText={props.onRepsChange}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#2D3748', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#F7FAFC', color: '#2D3748' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  subLabel: { fontSize: 11, fontWeight: '600', color: '#718096', marginBottom: 4 },
  listContainer: { position: 'absolute', top: 48, left: 0, right: 0, backgroundColor: '#FFF', borderRadius: 8, elevation: 5, zIndex: 100, borderColor: '#E2E8F0', borderWidth: 1 },
  listItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F7FAFC' },
  listItemText: { fontSize: 14, color: '#2D3748' }
});

export default ExerciseInputBlock;