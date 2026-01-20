import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WorkoutExercise, WorkoutSet } from '@/types/workout';
import { ScaleDecorator } from 'react-native-draggable-flatlist';

import SetRow from './SetRow';

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  activeTemplate: boolean;
  prSetIds: Set<string>;
  editingSetId?: string | null;
  isFetchingShareData: boolean;
  isHighlighted?: boolean;
  
  // [NOVO] Props para contexto de Programa e Substituição
  isProgram?: boolean;
  onSubstitute?: (exercise: WorkoutExercise) => void;

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
    editingSetId,
    isFetchingShareData,
    isHighlighted,
    isProgram,          // [NOVO]
    onSubstitute,       // [NOVO]
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

    // [NOVO] Verifica status de substituição
    const isSubstituted = !!exercise.substituted_by_id;
    const isSubstitution = !!exercise.is_substitution;

    // [NOVO] Renderização Simplificada para Exercício Substituído (Antigo)
    // Mostra apenas uma linha cinza indicando que ele estava lá, mas foi trocado.
    if (isSubstituted) {
      return (
        <ScaleDecorator>
          <View style={styles.containerWithConnector}>
            <View style={styles.substitutedContainer}>
              <View style={styles.substitutedContent}>
                <Text style={styles.substitutedTitle}>{exercise.name}</Text>
                <Text style={styles.substitutedLabel}>SUBSTITUÍDO</Text>
              </View>
              <Feather name="arrow-down-circle" size={20} color="#A0AEC0" />
            </View>
            {/* Linha conectora visual para o próximo card (o substituto) */}
            <View style={styles.verticalConnector} />
          </View>
        </ScaleDecorator>
      );
    }

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
            // Se for um exercício substituto, damos um destaque na borda (Roxo)
            isSubstitution && styles.substitutionCard
          ]}
        >
          {/* Header */}
          <View style={[styles.exerciseHeader, isSubstitution && styles.substitutionHeader]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.exerciseName, isHighlighted && { color: '#007AFF' }]}>
                  {exercise.name}
                </Text>
                
                {/* [NOVO] Badge de Substituto */}
                {isSubstitution && (
                  <View style={styles.subBadge}>
                    <Feather name="shuffle" size={10} color="#FFF" />
                    <Text style={styles.subBadgeText}>SUBSTITUTO</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.headerActions}>
              
              {/* [NOVO] Botão de Substituir */}
              {/* Aparece apenas se: É Programa E NÃO é um exercício já substituído E NÃO é o substituto */}
              {isProgram && onSubstitute && !isSubstitution && (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => onSubstitute(exercise)}
                >
                  <Feather name="refresh-cw" size={18} color="#805AD5" />
                </TouchableOpacity>
              )}

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
                isEditing={set.id === editingSetId}
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
  
  // Estilo específico para o card que entrou (Substituto)
  substitutionCard: {
    borderColor: '#D6BCFA',
    borderLeftWidth: 3,
    borderLeftColor: '#805AD5',
    marginTop: -4, // Puxa um pouco para cima para colar visualmente no conector
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
  substitutionHeader: {
    backgroundColor: '#FAF5FF',
  },
  
  exerciseName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2D3748',
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center'
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

  // [NOVO] Estilos para Badge de Substituto
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#805AD5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4
  },
  subBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },

  // [NOVO] Container wrapper para o card substituído + conector
  containerWithConnector: {
    alignItems: 'center',
    marginBottom: 0, // Sem margem inferior para colar no próximo
  },
  verticalConnector: {
    width: 2,
    height: 12,
    backgroundColor: '#CBD5E0',
    borderLeftWidth: 1,
    borderStyle: 'dashed' 
  },

  // [NOVO] Estilos para Card Substituído (Antigo)
  substitutedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7FAFC',
    width: '92%', // Mesma largura visual (margin 16 do card original)
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    opacity: 0.7,
  },
  substitutedContent: {
    flex: 1,
  },
  substitutedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#A0AEC0',
    textDecorationLine: 'line-through',
  },
  substitutedLabel: {
    fontSize: 10,
    color: '#718096',
    fontStyle: 'italic',
    marginTop: 2,
  },
});

export default ExerciseCard;