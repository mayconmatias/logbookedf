import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  UIManager,
  Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { toast } from 'sonner-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // [FIX] Import

// Services
import { fetchDashboardStats, DashboardStats } from '@/services/dashboard.service';
import { fetchStudentProgressReport, StudentProgressReport } from '@/services/stats.service';
import { fetchMacroEvolutionData, EvolutionPoint } from '@/services/evolution.service';
import { syncStravaActivities } from '@/services/strava.service';

// Components
import DaldaModal from '@/components/DaldaModal';
import { HighlightsWidget } from '@/components/dashboard/HighlightsWidget';
import { VolumeAnalysisWidget } from '@/components/dashboard/VolumeAnalysisWidget';
import { EvolutionWidget } from '@/components/dashboard/EvolutionWidget';
import { MuscleEvolutionCard } from '@/components/dashboard/MuscleEvolutionCard';
import { MacroEvolutionChart } from '@/components/dashboard/MacroEvolutionChart';
import { CardioWidget } from '@/components/dashboard/CardioWidget';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FilterKeys = 'normal' | 'warmup' | 'advanced';

// --- COMPONENTE INTERNO: CARD DE ESTADO (DALDA) ---
const HighContrastStateCard = ({ lastCheckin, onPress, t }: { lastCheckin: any, onPress: () => void, t: any }) => {
  const isToday = lastCheckin?.date === new Date().toISOString().split('T')[0];

  if (!isToday) {
    return (
      <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
        <LinearGradient colors={['#3182CE', '#2B6CB0']} style={styles.actionIcon}>
          <Feather name="activity" size={24} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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

// --- TELA PRINCIPAL ---
export default function DashboardScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(); // [FIX] Hook de Insets

  // Estados de Dados
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [progressReport, setProgressReport] = useState<StudentProgressReport | null>(null);

  // MACRO CHART (Geral vs Específico)
  const [generalMacroData, setGeneralMacroData] = useState<EvolutionPoint[]>([]);
  const [specificMacroData, setSpecificMacroData] = useState<EvolutionPoint[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [loadingSpecific, setLoadingSpecific] = useState(false);

  // Estados de Controle UI
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDaldaVisible, setIsDaldaVisible] = useState(false);

  // Estados de Filtros
  const [evolutionPeriod, setEvolutionPeriod] = useState(6); // Default: 6 semanas
  const [filters, setFilters] = useState<Record<FilterKeys, boolean>>({
    warmup: false,
    normal: true,
    advanced: true
  });

  // 1. CARGA INICIAL
  const load = useCallback(async () => {
    try {
      // Filtros
      const types: string[] = [];
      if (filters.warmup) types.push('warmup');
      if (filters.normal) types.push('normal');
      if (filters.advanced) types.push('drop', 'rest_pause', 'cluster', 'biset', 'triset');
      const queryTypes = types.length > 0 ? types : ['none'];

      const { data: { user } } = await supabase.auth.getUser();

      // Busca Paralela
      const [dataStats, dataProgress] = await Promise.all([
        fetchDashboardStats(queryTypes, null),
        user ? fetchStudentProgressReport(user.id, evolutionPeriod) : null
      ]);

      setStats(dataStats);
      setProgressReport(dataProgress);

      // Processa dados GERAIS para o gráfico do topo
      if (dataStats?.evolution_trend) {
        const formattedGeneral = dataStats.evolution_trend.map(d => ({
          date: d.date,
          label: d.date.split('-').slice(1).reverse().join('/'),
          volume: d.volume,
          avgReps: 0 // Endpoint geral ainda não traz reps
        }));
        setGeneralMacroData(formattedGeneral);
      }

    } catch (e) {
      toast.error('Erro ao carregar dados');
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, evolutionPeriod]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 2. SELEÇÃO DE MÚSCULO (ACCORDION)
  const handleMuscleSelect = async (muscle: string) => {
    // Se clicar no mesmo, fecha e volta para visão geral
    if (selectedMuscle === muscle) {
      setSelectedMuscle(null);
      setSpecificMacroData([]);
      return;
    }

    // Se clicar em outro, abre e busca dados específicos
    setSelectedMuscle(muscle);
    setLoadingSpecific(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const data = await fetchMacroEvolutionData(user.id, 'week', 'muscle_group', muscle);
        setSpecificMacroData(data);
      }
    } catch (e) {
      console.log("Erro ao buscar detalhe muscular:", e);
      toast.error('Dados insuficientes para este grupo.');
      setSpecificMacroData([]);
    } finally {
      setLoadingSpecific(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleFilter = (key: FilterKeys) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Lógica de exibição do gráfico do topo
  const activeChartData = selectedMuscle ? specificMacroData : generalMacroData;
  const activeChartTitle = selectedMuscle ? `Evolução: ${selectedMuscle}` : "Visão Geral do Treino";
  const activeChartColor = selectedMuscle ? "#38A169" : "#805AD5";

  if (loading && !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      // [FIX] Padding bottom considera a safe area + espaço para a navbar do sistema
      contentContainerStyle={{ paddingBottom: 80 + insets.bottom, paddingTop: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('dashboard.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('dashboard.subtitle')}</Text>
      </View>

      {/* 1. CHECK-IN DIÁRIO */}
      {stats?.last_checkin && (
        <HighContrastStateCard
          lastCheckin={stats.last_checkin}
          onPress={() => setIsDaldaVisible(true)}
          t={t}
        />
      )}

      {/* 2. DESTAQUES */}
      <HighlightsWidget stats={stats?.time_stats} />

      {/* 2.1 CARDIO (STRAVA) */}
      <CardioWidget summary={stats?.cardio_summary} />

      {/* 3. GRÁFICO MACRO */}
      <View style={{ marginBottom: 16 }}>
        {loadingSpecific ? (
          <View style={[styles.chartLoadingContainer, { height: 280 }]}>
            <ActivityIndicator size="large" color={activeChartColor} />
            <Text style={{ marginTop: 10, color: '#A0AEC0' }}>Carregando {selectedMuscle}...</Text>
          </View>
        ) : (
          <MacroEvolutionChart
            data={activeChartData}
            title={activeChartTitle}
            colorVolume={activeChartColor}
          />
        )}
      </View>

      {/* 4. ANÁLISE MUSCULAR (ACCORDION) */}
      {progressReport && (
        <MuscleEvolutionCard
          data={progressReport.muscle_summary}

          // Controle de Tempo
          currentPeriod={evolutionPeriod}
          onPeriodChange={setEvolutionPeriod}

          // Controle de Accordion
          expandedMuscle={selectedMuscle}
          onMuscleSelect={handleMuscleSelect}
        />
      )}

      {/* 5. VOLUME SEMANAL (LEGADO) */}
      <VolumeAnalysisWidget
        tagStats={stats?.tag_stats || []}
        exerciseStats={stats?.exercise_stats || []}
        filters={filters}
        onToggleFilter={toggleFilter}
      />

      {/* 6. EVOLUÇÃO GERAL (LEGADO) */}
      <EvolutionWidget
        weeklyData={stats?.evolution_trend || []}
        dailyData={stats?.evolution_daily || []}
      />

      <DaldaModal
        visible={isDaldaVisible}
        onClose={() => setIsDaldaVisible(false)}
        onSuccess={load}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#1A202C', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: '#718096', marginTop: 4 },

  actionCard: {
    backgroundColor: '#FFF', marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3
  },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  actionSub: { fontSize: 13, color: '#718096', marginTop: 2 },

  stateCard: {
    marginHorizontal: 20, marginBottom: 20, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
  },
  stateLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4, opacity: 0.8 },
  stateTitle: { fontSize: 22, fontWeight: '900' },
  insightBox: {
    marginTop: 16, padding: 12, borderRadius: 8, borderWidth: 1.5,
    borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.4)'
  },
  insightText: { fontSize: 14, fontWeight: '600', fontStyle: 'italic', lineHeight: 20 },

  chartLoadingContainer: {
    marginHorizontal: 16, borderRadius: 16, backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7'
  },
});