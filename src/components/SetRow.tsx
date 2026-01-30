import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WorkoutSet } from '@/types/workout';

interface SetRowProps {
  set: WorkoutSet;
  allSetsInExercise?: WorkoutSet[];
  exerciseId: string;
  definitionId: string;
  exerciseName: string;
  isPR: boolean;
  isFetchingShareData: boolean;

  // [NOVO] Propriedade para indicar destaque
  isEditing?: boolean;

  onEdit: (set: WorkoutSet) => void;
  onShare: (set: WorkoutSet, isPR: boolean, exerciseName: string, definitionId: string) => void;
  onDelete: (setId: string, exerciseId: string, definitionId: string) => void;
}

const SetRow = memo(
  ({
    set,
    allSetsInExercise,
    exerciseId,
    definitionId,
    exerciseName,
    isPR,
    isFetchingShareData,
    isEditing, // [NOVO] Recebendo a prop
    onEdit,
    onShare,
    onDelete,
  }: SetRowProps) => {

    // ... (Lógica de childSets e displayNumber mantida igual) ...
    const childSets = useMemo(() => {
      if (!allSetsInExercise) return [];
      return allSetsInExercise.filter(s => s.parent_set_id === set.id);
    }, [allSetsInExercise, set.id]);

    const displayNumber = useMemo(() => {
      if (!allSetsInExercise) return set.set_number;
      const isCurrentWarmup = set.set_type === 'warmup';
      const relevantSets = allSetsInExercise
        .filter(s => !s.parent_set_id)
        .filter(s => {
          const isItemWarmup = s.set_type === 'warmup';
          return isCurrentWarmup ? isItemWarmup : !isItemWarmup;
        })
        .sort((a, b) => a.set_number - b.set_number);

      const index = relevantSets.findIndex(s => s.id === set.id);
      return index >= 0 ? index + 1 : set.set_number;
    }, [allSetsInExercise, set.id, set.set_type, set.set_number]);

    if (set.parent_set_id) return null;

    const handlePress = () => onEdit(set);
    const handleShare = () => onShare(set, isPR, exerciseName, definitionId);
    const handleDelete = () => onDelete(set.id, exerciseId, definitionId);

    const isWarmup = set.set_type === 'warmup';
    const isSuper = ['biset', 'triset'].includes(set.set_type);

    const getTagLabel = () => {
      switch (set.set_type) {
        case 'drop': return 'DROP';
        case 'rest_pause': return 'REST-P';
        case 'cluster': return 'CLUSTER';
        case 'biset': return 'BI-SET';
        case 'triset': return 'TRI-SET';
        default: return null;
      }
    };
    const tagLabel = getTagLabel();

    return (
      <TouchableOpacity
        style={[
          styles.container,
          isPR && styles.prContainer,
          isWarmup && styles.warmupContainer,
          isSuper && styles.superContainer,
          // [NOVO] Aplica estilo de edição com prioridade
          isEditing && styles.editingContainer
        ]}
        onPress={handlePress}
        disabled={isFetchingShareData}
        activeOpacity={0.7}
      >
        <View style={styles.contentRow}>
          <View style={styles.badgeColumn}>
            <View style={[
              styles.setNumberBadge,
              isWarmup && styles.warmupBadge,
              isEditing && styles.editingBadge // [NOVO] Badge destaca também
            ]}>
              <Text style={[
                styles.setNumberText,
                isWarmup && styles.warmupText,
                isEditing && styles.editingBadgeText
              ]}>
                {isWarmup ? 'AQ' : '#'}{displayNumber}
              </Text>
            </View>
            {isPR && <Feather name="award" size={12} color="#D69E2E" style={{ marginTop: 4 }} />}
          </View>

          <View style={styles.dataColumn}>
            <View style={styles.mainLine}>
              <Text style={[styles.weightText, isEditing && styles.editingText]}>
                {set.weight} <Text style={styles.unit}>kg</Text>
              </Text>
              <Text style={styles.separator}>×</Text>
              <Text style={[styles.repsText, isEditing && styles.editingText]}>
                {set.reps} <Text style={styles.unit}>reps</Text>
              </Text>
              {set.rpe && (
                <View style={styles.rpeBadge}>
                  <Text style={styles.rpeText}>@{set.rpe}</Text>
                </View>
              )}
            </View>

            {/* ... (Resto do render: metaLine, obsText, childSets mantido igual) ... */}
            {(tagLabel || set.side) && (
              <View style={styles.metaLine}>
                {tagLabel && <Text style={[styles.metaTag, { color: '#E53E3E' }]}>{tagLabel}</Text>}
                {set.side && <Text style={styles.metaSide}>{set.side === 'E' ? 'Esq.' : 'Dir.'}</Text>}
              </View>
            )}

            {set.observations ? (
              <Text style={styles.obsText} numberOfLines={1}>
                <Feather name="message-square" size={10} /> {set.observations}
              </Text>
            ) : null}

            {/* [NOVO] Informação de Música Inline */}
            {set.music_data && (
              <Text style={styles.musicText} numberOfLines={1}>
                <Feather name="music" size={10} /> {set.music_data.track} <Text style={styles.artistText}>• {set.music_data.artist}</Text>
              </Text>
            )}

            {childSets.length > 0 && (
              <View style={styles.childrenContainer}>
                {childSets.map((child) => {
                  const diff = set.weight - child.weight;
                  const perc = set.weight > 0 ? Math.round((diff / set.weight) * 100) : 0;
                  return (
                    <View key={child.id} style={styles.childRow}>
                      <Feather name="corner-down-right" size={12} color="#718096" style={{ marginRight: 4 }} />
                      <Text style={styles.childText}>
                        {child.weight}kg × {child.reps}
                        {perc > 0 && <Text style={styles.dropPerc}> (-{perc}%)</Text>}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.actionsColumn}>
            {/* [UX] Mostra ícone de edição se estiver editando */}
            {isEditing ? (
              <Feather name="edit-2" size={18} color="#3182CE" style={{ marginRight: 8 }} />
            ) : (
              <>
                {!isWarmup && (
                  <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                    <Feather name="share-2" size={16} color="#718096" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
                  <Feather name="trash-2" size={16} color="#E53E3E" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

const styles = StyleSheet.create({
  // ... (Estilos existentes)
  container: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: 10, paddingHorizontal: 12 },
  prContainer: { backgroundColor: '#FFFAF0' },
  warmupContainer: { backgroundColor: '#F7FAFC' },
  superContainer: { borderLeftWidth: 3, borderLeftColor: '#DD6B20' },

  // [NOVO] Estilo de Edição (Azul claro com borda esquerda azul forte)
  editingContainer: {
    backgroundColor: '#EBF8FF',
    borderLeftWidth: 4,
    borderLeftColor: '#3182CE',
    paddingLeft: 8 // Compensa a borda para alinhar
  },

  contentRow: { flexDirection: 'row', alignItems: 'flex-start' },
  badgeColumn: { width: 36, alignItems: 'center', marginRight: 10, paddingTop: 2 },

  setNumberBadge: { backgroundColor: '#EDF2F7', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  warmupBadge: { backgroundColor: '#FEFCBF' },

  // [NOVO] Estilos de Badge e Texto em edição
  editingBadge: { backgroundColor: '#3182CE' },
  editingBadgeText: { color: '#FFFFFF' },
  editingText: { color: '#2B6CB0' },

  setNumberText: { fontSize: 11, fontWeight: '900', color: '#4A5568' },
  warmupText: { color: '#D69E2E' },
  dataColumn: { flex: 1, justifyContent: 'center' },
  mainLine: { flexDirection: 'row', alignItems: 'baseline' },
  weightText: { fontSize: 16, fontWeight: '800', color: '#1A202C' },
  repsText: { fontSize: 16, fontWeight: '800', color: '#1A202C' },
  separator: { fontSize: 14, color: '#A0AEC0', marginHorizontal: 4 },
  unit: { fontSize: 11, fontWeight: '500', color: '#718096' },
  rpeBadge: { marginLeft: 8, backgroundColor: '#EDF2F7', borderRadius: 4, paddingHorizontal: 4 },
  rpeText: { fontSize: 10, fontWeight: '700', color: '#4A5568' },
  metaLine: { flexDirection: 'row', gap: 6, marginTop: 2 },
  metaTag: { fontSize: 9, fontWeight: '800', color: '#D69E2E', textTransform: 'uppercase' },
  metaSide: { fontSize: 9, fontWeight: '700', color: '#718096' },
  obsText: { fontSize: 11, color: '#718096', fontStyle: 'italic', marginTop: 2 },
  childrenContainer: { marginTop: 4, paddingLeft: 4 },
  childRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  childText: { fontSize: 13, color: '#4A5568', fontWeight: '500' },
  dropPerc: { fontSize: 11, color: '#E53E3E' },

  // [NOVO] Estilos de Música Inline
  musicText: { fontSize: 10, color: '#A0AEC0', marginTop: 2, alignItems: 'center' },
  artistText: { fontSize: 9, color: '#CBD5E0' },

  actionsColumn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { padding: 6 },
  deleteBtn: { marginRight: -6 },
});

export default SetRow;