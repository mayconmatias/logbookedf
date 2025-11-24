import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';
import SetRow from './SetRow';
import { ScaleDecorator } from 'react-native-draggable-flatlist';

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  activeTemplate: boolean;
  prSetIds: Set<string>;
  isFetchingShareData: boolean;
  onShowAnalytics: (definitionId: string, exerciseName: string) => void;
  // onOpenMenu removido pois removemos o botão
  onEditSet: (set: WorkoutSet) => void;
  onShareSet: (set: WorkoutSet, isPR: boolean, exerciseName: string, definitionId: string) => void;
  onDeleteSet: (setId: string, exerciseId: string, definitionId: string) => void;
  // Nova prop para clicar e preencher o formulário
  onPopulateForm: (name: string, definitionId: string) => void;
  
  // Props do Drag & Drop
  drag?: () => void;
  isActive?: boolean;
}

const ExerciseCard = memo(
  ({
    exercise,
    activeTemplate,
    prSetIds,
    isFetchingShareData,
    onShowAnalytics,
    onEditSet,
    onShareSet,
    onDeleteSet,
    onPopulateForm,
    drag,
    isActive,
  }: ExerciseCardProps) => {
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag} // Clique Longo -> Arrasta
          onPress={() => onPopulateForm(exercise.name, exercise.definition_id)} // Clique Simples -> Joga no Form
          activeOpacity={0.9} // Feedback visual leve
          disabled={isActive} // Desabilita clique enquanto arrasta
          style={[
            styles.exerciseCard,
            isActive && styles.cardActive,
          ]}
        >
          <View style={styles.exerciseHeader}>
            {/* Nome do Exercício (Agora alinhado à esquerda sem ícone antes) */}
            <Text style={styles.exerciseName}>{exercise.name}</Text>

            <View style={styles.exerciseHeaderIcons}>
              {/* Mantivemos o Info (Analytics) pois é uma função diferente de editar/menu */}
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => onShowAnalytics(exercise.definition_id, exercise.name)}
              >
                <Feather name="info" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>

          {exercise.sets.length === 0 && activeTemplate && (
            <Text style={styles.emptySetText}>
              Séries ainda não registradas...
            </Text>
          )}

          {/* Renderiza as séries. O toque na série (SetRow) tem prioridade sobre o toque no Card */}
          {exercise.sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              exerciseId={exercise.id}
              definitionId={exercise.definition_id}
              exerciseName={exercise.name}
              isPR={prSetIds.has(set.id)}
              isFetchingShareData={isFetchingShareData}
              onEdit={onEditSet}
              onShare={onShareSet}
              onDelete={onDeleteSet}
            />
          ))}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }
);

const styles = StyleSheet.create({
  exerciseCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 20,
    // Sombra suave
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardActive: {
    backgroundColor: '#EBF8FF',
    borderColor: '#007AFF',
    shadowOpacity: 0.2,
    elevation: 10,
    zIndex: 999,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
    marginBottom: 12,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    color: '#2D3748',
  },
  exerciseHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  emptySetText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
});

export default ExerciseCard;