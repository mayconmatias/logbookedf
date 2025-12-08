import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Alert, UIManager, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { toast } from 'sonner-native';
import { useTranslation } from 'react-i18next';

import { fetchDashboardStats, DashboardStats } from '@/services/dashboard.service';
import { autoClassifyExistingExercises } from '@/services/exercises.service';
import DaldaModal from '@/components/DaldaModal';

// Widgets Refatorados
import { HighlightsWidget } from '@/components/dashboard/HighlightsWidget';
import { VolumeAnalysisWidget } from '@/components/dashboard/VolumeAnalysisWidget';
import { EvolutionWidget } from '@/components/dashboard/EvolutionWidget';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FilterKeys = 'normal' | 'warmup' | 'advanced';

const HighContrastStateCard = ({ lastCheckin, onPress, t }: { lastCheckin: any, onPress: () => void, t: any }) => {
  const isToday = lastCheckin?.date === new Date().toISOString().split('T')[0];

  if (!isToday) {
    return (
      <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
        <LinearGradient colors={['#3182CE', '#2B6CB0']} style={styles.actionIcon}>
          <Feather name="activity" size={24} color="#FFF" />
        </LinearGradient>
        <View style={{flex: 1}}>
          <Text style={styles.actionTitle}>{t('dashboard.checkinTitle')}</Text>
          <Text style={styles.actionSub}>{t('dashboard.checkinSub')}</Text>
        </View>
        <Feather name="chevron-right" size={20} color="#CBD5E0" />
      </TouchableOpacity>
    );
  }

  const score = lastCheckin.total_score;
  let bgColors = ['#F0FFF4', '#C6F6D5'];
  let textColor = '#22543D'; 
  let iconName: any = 'sun';
  let statusText = t('dashboard.stateHigh');

  if (score < -1) { 
    bgColors = ['#FFF5F5', '#FED7D7']; 
    textColor = '#742A2A'; 
    iconName = 'battery-charging'; 
    statusText = t('dashboard.stateRecovery');
  } else if (score < 2) { 
    bgColors = ['#FFFFF0', '#FEFCBF']; 
    textColor = '#744210'; 
    iconName = 'wind'; 
    statusText = t('dashboard.stateModerate');
  }

  return (
    <LinearGradient colors={bgColors as any} style={styles.stateCard}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
        <View>
          <Text style={[styles.stateLabel, { color: textColor }]}>{t('dashboard.stateLabel')}</Text>
          <Text style={[styles.stateTitle, { color: textColor }]}>{statusText}</Text>
        </View>
        <Feather name={iconName as any} size={28} color={textColor} />
      </View>

      {lastCheckin.ai_insight && (
        <View style={[styles.insightBox, { borderColor: textColor }]}>
          <Text style={[styles.insightText, { color: textColor }]}>
            "{lastCheckin.ai_insight}"
          </Text>
        </View>
      )}
    </LinearGradient>
  );
};

export default function DashboardScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDaldaVisible, setIsDaldaVisible] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const [filters, setFilters] = useState<Record<FilterKeys, boolean>>({
    warmup: false,
    normal: true,
    advanced: true
  });

  const load = useCallback(async () => {
    try {
      const types: string[] = [];
      if (filters.warmup) types.push('warmup');
      if (filters.normal) types.push('normal');
      if (filters.advanced) types.push('drop', 'rest_pause', 'cluster', 'biset', 'triset');

      const queryTypes = types.length > 0 ? types : ['none'];

      const data = await fetchDashboardStats(queryTypes, null);
      setStats(data);
    } catch (e) { 
      toast.error('Erro ao carregar dados');
    } finally { 
      setLoading(false); 
      setRefreshing(false); 
    }
  }, [filters]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const handleRefresh = () => { setRefreshing(true); load(); };

  const handleForceReclassify = async () => {
    setRepairing(true);
    try {
      Alert.alert(
        "Reclassificar Biblioteca",
        "A IA irá re-analisar TODOS os seus exercícios para corrigir categorias (Peito, Costas, etc). Isso pode levar um minuto.",
        [
          { text: "Cancelar", style: "cancel", onPress: () => setRepairing(false) },
          { 
            text: "Iniciar", 
            onPress: async () => {
              toast.message('Iniciando manutenção...');
              const count = await autoClassifyExistingExercises(true);
              toast.success(`${count} exercícios processados e corrigidos.`);
              load();
              setRepairing(false);
            }
          }
        ]
      );
    } catch (e) {
      toast.error('Falha na conexão.');
      setRepairing(false);
    }
  };

  const toggleFilter = (key: FilterKeys) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading && !stats) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      contentContainerStyle={{ paddingBottom: 80, paddingTop: 20 }}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('dashboard.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('dashboard.subtitle')}</Text>
      </View>

      {/* CARD 0: ESTADO DALDA */}
      {stats?.last_checkin && (
         <HighContrastStateCard lastCheckin={stats.last_checkin} onPress={() => setIsDaldaVisible(true)} t={t} />
      )}

      {/* WIDGETS */}
      <HighlightsWidget stats={stats?.time_stats} />
      <VolumeAnalysisWidget 
         tagStats={stats?.tag_stats || []} 
         exerciseStats={stats?.exercise_stats || []}
         filters={filters} 
         onToggleFilter={toggleFilter}
      />
      <EvolutionWidget 
         weeklyData={stats?.evolution_trend || []} 
         dailyData={stats?.evolution_daily || []} 
      />

      {/* Botão de Manutenção */}
      <TouchableOpacity style={styles.repairButton} onPress={handleForceReclassify} disabled={repairing}>
        {repairing ? <ActivityIndicator color="#718096" size="small" /> : <Feather name="tool" size={14} color="#718096" />}
        <Text style={styles.repairText}>
          {repairing ? t('dashboard.processing') : t('dashboard.catalogMaintenance')}
        </Text>
      </TouchableOpacity>

      <DaldaModal visible={isDaldaVisible} onClose={() => setIsDaldaVisible(false)} onSuccess={load} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1A202C', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: '#718096', marginTop: 4 },
  actionCard: { backgroundColor: '#FFF', marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  actionSub: { fontSize: 13, color: '#718096', marginTop: 2 },
  stateCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  stateLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4, opacity: 0.8 },
  stateTitle: { fontSize: 22, fontWeight: '900' },
  insightBox: { marginTop: 16, padding: 12, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.4)' },
  insightText: { fontSize: 14, fontWeight: '600', fontStyle: 'italic', lineHeight: 20 },
  repairButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, opacity: 0.8 },
  repairText: { color: '#718096', fontWeight: '500', fontSize: 12 },
});