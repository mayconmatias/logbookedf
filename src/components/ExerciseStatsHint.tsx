import React, { useEffect, useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { usePerformancePeek } from '@/hooks/usePerformancePeek';
import { getDaysAgo } from '@/utils/date';
import { LBS_TO_KG_FACTOR } from '@/utils/e1rm';

interface Props {
  definitionId: string | null;
  inputUnit: 'kg' | 'lbs';
}

export default function ExerciseStatsHint({ definitionId, inputUnit }: Props) {
  const { performanceData, loadingStats, fetchQuickStats } = usePerformancePeek();
  const [mode, setMode] = React.useState<'best' | 'last'>('best');

  useEffect(() => {
    if (definitionId) {
      fetchQuickStats(definitionId);
    }
  }, [definitionId]);

  const formatWeight = (val: number) => {
    let w = val;
    let u = 'kg';
    if (inputUnit === 'lbs') {
      w = w / LBS_TO_KG_FACTOR;
      u = 'lbs';
    }
    return `${parseFloat(w.toFixed(1))}${u}`;
  };

  const bestString = useMemo(() => {
    if (!performanceData?.bestPerformance) return null;
    const p = performanceData.bestPerformance;
    return `🏆 Melhor: ${formatWeight(p.weight)} x ${p.reps} (${getDaysAgo(p.workout_date)})`;
  }, [performanceData, inputUnit]);

  const lastString = useMemo(() => {
    if (!performanceData?.lastPerformance || performanceData.lastPerformance.length === 0) return null;
    const p = performanceData.lastPerformance[0];
    return `↺ Última: ${formatWeight(p.weight)} x ${p.reps} (${getDaysAgo(p.workout_date)})`;
  }, [performanceData, inputUnit]);

  const toggleMode = () => setMode(prev => prev === 'best' ? 'last' : 'best');

  const activeString = mode === 'best' ? (bestString || lastString) : (lastString || bestString);
  const activeColor = (mode === 'best' && bestString) ? '#D97706' : '#718096';

  if (loadingStats) return <ActivityIndicator size="small" color="#CCC" />;
  if (!activeString) return null;

  return (
    <TouchableOpacity onPress={toggleMode} activeOpacity={0.6}>
      <Text style={[styles.hintText, { color: activeColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {activeString}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hintText: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 4 },
});