import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WorkoutSet } from '@/types/workout';

interface SetRowProps {
  set: WorkoutSet;
  exerciseId: string;
  definitionId: string;
  exerciseName: string;
  isPR: boolean;
  isFetchingShareData: boolean;
  onEdit: (set: WorkoutSet) => void; 
  onShare: (set: WorkoutSet, isPR: boolean, exerciseName: string, definitionId: string) => void;
  onDelete: (setId: string, exerciseId: string, definitionId: string) => void;
}

const SetRow = memo(
  ({
    set,
    exerciseId,
    definitionId,
    exerciseName,
    isPR,
    isFetchingShareData,
    onEdit,   
    onShare,  
    onDelete,
  }: SetRowProps) => {
    
    const isGhostSet = useMemo(() => {
      return set.weight === 0 && set.reps === 0;
    }, [set.weight, set.reps]);

    const handlePress = () => {
      onEdit(set);
    };

    const handleShare = () => {
      onShare(set, isPR, exerciseName, definitionId);
    }

    const handleDelete = () => {
      onDelete(set.id, exerciseId, definitionId);
    };

    if (isGhostSet) {
      return (
        <TouchableOpacity
          style={[styles.setRow, styles.ghostRow]}
          onPress={handlePress}
          disabled={isFetchingShareData}
        >
          <View style={styles.setRowContent}>
            <View style={styles.setTextContainer}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Feather name="square" size={18} color="#D97706" />
                <Text style={styles.ghostText}>
                  <Text style={{ fontWeight: 'bold' }}>Série {set.set_number}:</Text>{' '}
                  Pendente
                </Text>
              </View>
              {set.rpe ? (
                <Text style={styles.ghostSubText}>Meta: RPE {set.rpe}</Text>
              ) : (
                <Text style={styles.ghostSubText}>Toque para registrar carga e reps</Text>
              )}
            </View>
            <TouchableOpacity style={styles.deleteSetButton} onPress={handleDelete}>
              <Feather name="x" size={16} color="#A0AEC0" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.setRow, isPR && styles.prRow]}
        onPress={handlePress}
        disabled={isFetchingShareData}
      >
        <View style={styles.setRowContent}>
          <View style={styles.setTextContainer}>
            <Text style={styles.setText}>
              {isPR ? '🏆 ' : ''}
              <Text style={{ fontWeight: 'bold' }}>Série {set.set_number}:</Text>{' '}
              {set.weight}kg x {set.reps} reps
              {set.side ? ` (${set.side})` : ''}
              {set.rpe ? ` @ RPE ${set.rpe}` : ''}
            </Text>
            {set.observations && (
              <Text style={styles.obsText}>↳ {set.observations}</Text>
            )}
            <Text style={styles.timeText}>
              {set.performed_at
                ? new Date(set.performed_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '...'}
            </Text>
          </View>
          
          <View style={styles.actions}>
            <TouchableOpacity style={styles.deleteSetButton} onPress={handleShare}>
              <Feather name="share-2" size={18} color="#007AFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteSetButton} onPress={handleDelete}>
              <Feather name="trash-2" size={18} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

const styles = StyleSheet.create({
  setRow: { marginBottom: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  prRow: { backgroundColor: '#FFFBEB' },
  ghostRow: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  setRowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setTextContainer: { flex: 1, marginRight: 10 },
  setText: { fontSize: 16, color: '#333', flexWrap: 'wrap' },
  ghostText: { fontSize: 16, color: '#D97706' },
  ghostSubText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginLeft: 26, marginTop: 2 },
  obsText: { fontSize: 14, color: '#555', fontStyle: 'italic', marginLeft: 10, marginTop: 2 },
  timeText: { fontSize: 12, color: '#888', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteSetButton: { padding: 8 },
});

export default SetRow;