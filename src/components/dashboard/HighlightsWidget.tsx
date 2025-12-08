import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const formatSeconds = (secs: number) => {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const HighlightsWidget = ({ stats }: { stats: any }) => {
  const { t } = useTranslation();
  
  if (!stats) return null;
  const hours = Math.floor(stats.avg_session_minutes / 60);
  const mins = Math.round(stats.avg_session_minutes % 60);

  return (
    <View style={styles.statsRow}>
      {/* 1. TEMPO MÉDIO */}
      <View style={styles.statBox}>
        <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}>
           <Feather name="clock" size={20} color="#805AD5" />
        </View>
        <View>
           <Text style={styles.statValue}>
             {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
           </Text>
           <Text style={styles.statLabel}>{t('dashboard.avgDuration')}</Text>
        </View>
      </View>

      {/* 2. SÉRIES POR SESSÃO */}
      <View style={styles.statBox}>
        <View style={[styles.iconCircle, { backgroundColor: '#EBF8FF' }]}>
           <Feather name="layers" size={20} color="#3182CE" />
        </View>
        <View>
           <Text style={styles.statValue}>
             {stats.sets_min}-{stats.sets_max}
           </Text>
           <Text style={styles.statLabel}>{t('dashboard.setsPerSession')}</Text>
        </View>
      </View>

      {/* 3. DESCANSO USADO */}
      <View style={styles.statBox}>
        <View style={[styles.iconCircle, { backgroundColor: '#E6FFFA' }]}>
          <Feather name="coffee" size={20} color="#319795" />
        </View>
        <View>
          <Text style={styles.statValueSm}>
            {formatSeconds(stats.rest_min_seconds)}-{formatSeconds(stats.rest_max_seconds)}
          </Text>
          <Text style={styles.statLabel}>{t('dashboard.actualRest')}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24, paddingHorizontal: 20 },
  statBox: { 
    flex: 1, 
    backgroundColor: '#FFF', 
    padding: 12,
    borderRadius: 16, 
    justifyContent: 'space-between',
    minHeight: 110,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#2D3748' },
  statValueSm: { fontSize: 16, fontWeight: '800', color: '#2D3748' },
  statLabel: { fontSize: 10, color: '#718096', fontWeight: '600', marginTop: 4 },
});