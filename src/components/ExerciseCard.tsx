import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';
import { ScaleDecorator } from 'react-native-draggable-flatlist';

// IMPORTAÇÃO PADRÃO
import SetRow from './SetRow';

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  activeTemplate: boolean;
  prSetIds: Set<string>;
  editingSetId?: string | null; // <--- Está na interface
  isFetchingShareData: boolean;
  isHighlighted?: boolean;
  onShowAnalytics: (definitionId: string, exerciseName: string) => void;
  onEditSet: (set: WorkoutSet) => void;
  onShareSet: (set: WorkoutSet, isPR: boolean, exerciseName: string, definitionId: string) => void;
  onDeleteSet: (setId: string, exerciseId: string, definitionId: string) => void;
  onPopulateForm: (name: string, definitionId: string) => void;
  onDeleteExercise: (exerciseInstanceId: string) => void;
  drag?: () => void;
  isActive?: boolean;
}

const ExerciseCard = memo(
  ({
    exercise,
    activeTemplate,
    prSetIds,
    editingSetId, // <--- 1. ADICIONADO AQUI
    isFetchingShareData,
    isHighlighted,
    onShowAnalytics,
    onEditSet,
    onShareSet,
    onDeleteSet,
    onPopulateForm,
    onDeleteExercise,
    drag,
    isActive,
  }: ExerciseCardProps) => {

    const handleDeletePress = () => {
      Alert.alert(
        'Remover Exercício',
        `Deseja remover "${exercise.name}" e todas as suas séries deste treino?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Remover', 
            style: 'destructive', 
            onPress: () => onDeleteExercise(exercise.id) 
          }
        ]
      );
    };

    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          onPress={() => onPopulateForm(exercise.name, exercise.definition_id)}
          activeOpacity={0.9}
          disabled={isActive}
          style={[
            styles.exerciseCard,
            isActive && styles.cardDragging,
            isHighlighted && styles.cardHighlighted,
          ]}
        >
          {/* Header */}
          <View style={styles.exerciseHeader}>
            <Text style={[styles.exerciseName, isHighlighted && { color: '#007AFF' }]}>
              {exercise.name}
            </Text>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => onShowAnalytics(exercise.definition_id, exercise.name)}
              >
                <Feather name="bar-chart-2" size={18} color={isHighlighted ? "#007AFF" : "#A0AEC0"} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleDeletePress}
              >
                <Feather name="x" size={18} color="#E53E3E" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sets List */}
          <View style={styles.setsList}>
            {exercise.sets.length === 0 && activeTemplate && (
              <Text style={styles.emptySetText}>Séries programadas...</Text>
            )}

            {exercise.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                allSetsInExercise={exercise.sets}
                exerciseId={exercise.id}
                definitionId={exercise.definition_id}
                exerciseName={exercise.name}
                // CORREÇÃO ABAIXO: removido 'props.' e usado a variável direta
                isEditing={editingSetId === set.id} 
                isPR={prSetIds.has(set.id)}
                isFetchingShareData={isFetchingShareData}
                onEdit={onEditSet}
                onShare={onShareSet}
                onDelete={onDeleteSet}
              />
            ))}
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }
);

const styles = StyleSheet.create({
  exerciseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  cardDragging: {
    borderColor: '#007AFF',
    shadowOpacity: 0.2,
    elevation: 10,
    zIndex: 999,
  },
  cardHighlighted: {
    borderColor: '#007AFF',
    borderWidth: 2,
    backgroundColor: '#F0F9FF',
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: 'rgba(247, 250, 252, 0.5)',
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2D3748',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4
  },
  iconButton: {
    padding: 6,
  },
  setsList: {
    paddingBottom: 4,
  },
  emptySetText: {
    fontSize: 12,
    color: '#A0AEC0',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
});

export default ExerciseCard;