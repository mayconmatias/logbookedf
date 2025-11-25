import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons'; // [MIGRAÇÃO] Usando Feather nativo
import { LinearGradient } from 'expo-linear-gradient';
import { HistoricalSet } from '@/types/workout';
import { calculateE1RM } from '@/utils/e1rm';

const { width } = Dimensions.get('window');

interface Props {
  exerciseName: string;
  set: HistoricalSet | null;
  previousSet: HistoricalSet | null;
  isPR: boolean;
  getDaysAgo: (date: string | Date) => string;
  bgOpacity: number;
  prKind?: 'e1rm' | 'reps' | 'none';
}

const DiffBadge = ({ diff, unit, isPositive }: any) => {
  if (diff === 0) return null;
  const color = isPositive ? '#38A169' : '#E53E3E';
  const sign = isPositive ? '+' : '';

  return (
    <View style={[styles.diffBadge, { backgroundColor: color }]}>
      <Text style={styles.diffText}>
        {sign}{diff.toFixed(0)} {unit}
      </Text>
    </View>
  );
};

const PerformanceColumn = ({ label, dateLabel, set }: any) => (
  <View style={styles.column}>
    <Text style={styles.columnLabel}>{label}</Text>
    <Text style={styles.dateLabel}>{dateLabel}</Text>

    <View style={styles.dataRow}>
      <Text style={styles.dataValue}>{set.weight.toFixed(1)}</Text>
      <Text style={styles.dataUnit}>kg</Text>
    </View>

    <Text style={styles.repText}>x {set.reps} reps</Text>

    <Text style={styles.e1rmText}>
      {calculateE1RM(set.weight, set.reps).toFixed(1)} e1RM
    </Text>
  </View>
);

export default function SetShareCard({
  exerciseName,
  set,
  previousSet,
  isPR,
  prKind = 'none',
  getDaysAgo,
  bgOpacity,
}: Props) {
  if (!set) return null;

  let repDiff = 0;
  let weightDiff = 0;

  if (previousSet) {
    repDiff = set.reps - previousSet.reps;
    weightDiff = set.weight - previousSet.weight;
  }

  return (
    <View style={styles.wrapper}>
      <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
        <LinearGradient
          colors={['#232526', '#414345']}
          style={styles.background}
        />
      </View>

      <View style={{ opacity: 1 }}>
        <View style={styles.headerRow}>
          <View style={styles.header}>
            {/* [MIGRAÇÃO] Ícone trocado para Feather */}
            {isPR && <Feather name="award" size={24} color="#F6E05E" style={{ marginRight: 10 }} />}
            <View>
              <Text style={styles.title}>
                {isPR ? 'NOVO RECORDE!' : 'SÉRIE CONCLUÍDA'}
              </Text>

              {prKind === 'e1rm' && (
                <Text style={styles.prType}>Recorde de peso / e1RM</Text>
              )}
              {prKind === 'reps' && (
                <Text style={styles.prType}>Recorde de repetições</Text>
              )}
            </View>
          </View>

          <Text style={styles.exerciseName}>{exerciseName}</Text>
        </View>

        <View style={styles.compareBox}>
          {previousSet ? (
            <>
              <PerformanceColumn
                label="ANTES"
                set={previousSet}
                dateLabel={getDaysAgo(previousSet.date)}
              />
              <View style={styles.separator} />
              <PerformanceColumn
                label="HOJE"
                set={set}
                dateLabel="hoje"
              />
            </>
          ) : (
            <PerformanceColumn label="HOJE" set={set} dateLabel="" />
          )}
        </View>

        {isPR && (
          <View style={styles.diffContainer}>
            <DiffBadge diff={weightDiff} unit="kg" isPositive={weightDiff > 0} />
            <DiffBadge diff={repDiff} unit="reps" isPositive={repDiff > 0} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: width - 48,
    padding: 24,
    borderRadius: 20,
    overflow: 'hidden',
  },
  background: { flex: 1 },
  headerRow: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#F6E05E', fontSize: 18, fontWeight: 'bold' },
  prType: { color: '#CBD5E0', fontSize: 12, marginTop: 2 },
  exerciseName: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 6 },
  compareBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    justifyContent: 'space-between',
  },
  separator: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },
  dataRow: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1 },
  columnLabel: { color: '#A0AEC0', fontSize: 12, fontWeight: '600' },
  dateLabel: { color: '#718096', fontSize: 11, marginBottom: 8 },
  dataValue: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  dataUnit: { color: '#FFF', fontSize: 16, marginLeft: 4 },
  repText: { color: '#FFF', fontSize: 16, marginTop: 4 },
  e1rmText: { color: '#A0AEC0', fontSize: 14, marginTop: 4 },
  diffContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  diffBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  diffText: { color: '#FFF', fontWeight: 'bold' },
});