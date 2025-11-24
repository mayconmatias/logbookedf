import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

// --- Imports de Gráficos ---
import {
  VictoryChart,
  VictoryLine,
  VictoryArea,
  VictoryTheme,
  VictoryAxis,
  VictoryCursorContainer,
  VictoryLabel,
} from 'victory-native';
import { Defs, LinearGradient, Stop, Line } from 'react-native-svg';

// --- Imports do Calendário ---
import { Calendar, LocaleConfig } from 'react-native-calendars';
import {
  Flame,
  TrendingUp,
  BarChart3,
  Trophy,
  History,
  AlertCircle,
  CalendarDays,
} from 'lucide-react-native';

import { supabase } from '@/lib/supabaseClient';
import { fetchExerciseAnalytics } from '@/services/progression.service';
import {
  ExerciseAnalyticsData,
  CurrentBestSet,
  HistoricalSet,
  ChartDataPoint,
  CalendarDay,
} from '@/types/analytics';
import t from '@/i18n/pt'; // Importar strings

// Configuração de localidade
LocaleConfig.locales['pt-br'] = {
  monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  monthNamesShort: ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.', ],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'],
  today: "Hoje"
};
LocaleConfig.defaultLocale = 'pt-br';

// --- Tipos e Helpers ---
export type ExerciseAnalyticsSheetRef = {
  // [CORREÇÃO AQUI] Renomeado de 'open' para 'openSheet' e ajustado para nova ordem
  openSheet: (
    definitionId: string,
    exerciseName: string,
    currentBestSet?: CurrentBestSet | null,
    studentId?: string // <--- NOVO PARÂMETRO OPCIONAL
  ) => void;
  close: () => void;
};

const parseLocalDate = (dateString: string): Date => {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  } catch (e) {
    return new Date(dateString);
  }
};


// ---------- KPIs ----------
interface KpiCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  color: string;
}
const KpiCard: React.FC<KpiCardProps> = ({
  title,
  icon: Icon,
  children,
  color,
}) => (
  <View style={styles.kpiCard}>
    <View style={styles.kpiHeader}>
      <Icon color={color} size={16} />
      <Text style={[styles.kpiTitle, { color }]}>{title}</Text>
    </View>
    <View style={styles.kpiContent}>{children}</View>
  </View>
);
const PrStreakCard: React.FC<{ analytics: ExerciseAnalyticsData }> = ({
  analytics,
}) => {
  const { prStreakCount, daysSinceLastPR } = analytics;
  return (
    <KpiCard
      title={t.analytics.streakTitle}
      icon={Flame}
      color={prStreakCount > 0 ? '#E53E3E' : '#4A5568'}
    >
      {prStreakCount > 0 ? (
        <>
          <Text style={styles.kpiValue}>{prStreakCount}</Text>
          <Text style={styles.kpiUnit}>
            {prStreakCount === 1 ? t.analytics.streakUnitOne : t.analytics.streakUnitMany}{' '}
            {prStreakCount > 1 ? t.analytics.streakConsecutive : ''}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.kpiValue}>
            {daysSinceLastPR !== null ? daysSinceLastPR : 'N/A'}
          </Text>
          <Text style={styles.kpiUnit}>
            {daysSinceLastPR === 1 ? t.analytics.daysSincePRUnitOne : t.analytics.daysSincePRUnitMany}{' '}
            {t.analytics.daysSincePRPrefix}
          </Text>
        </>
      )}
    </KpiCard>
  );
};
const PerformanceCard: React.FC<{
  current: CurrentBestSet | null;
  previous: HistoricalSet | null;
}> = ({ current, previous }) => {
  const weightDiff = current && previous ? current.weight - previous.weight : 0;
  const repsDiff = current && previous ? current.reps - previous.reps : 0;
  const e1rmDiff = current && previous ? current.e1rm - previous.e1rm : 0;
  const renderDiff = (value: number, unit: string) => {
    const sign = value > 0 ? '+' : '';
    let color = '#4A5568';
    if (value > 0) color = '#38A169';
    if (value < 0) color = '#E53E3E';
    return (
      <Text style={[styles.diffText, { color }]}>
        {sign}
        {value.toFixed(1)} {unit}
      </Text>
    );
  };
  return (
    <KpiCard title={t.analytics.performanceTitle} icon={TrendingUp} color="#2B6CB0">
      {!current || !previous ? (
        <Text style={styles.kpiUnit}>
          {current
            ? t.analytics.performanceNoData
            : t.analytics.performanceNoCurrent}
        </Text>
      ) : (
        <View style={styles.diffContainer}>
          {renderDiff(weightDiff, 'kg')}
          {renderDiff(repsDiff, 'reps')}
          {renderDiff(e1rmDiff, 'e1RM')}
        </View>
      )}
    </KpiCard>
  );
};


// ---------- Gráficos e Calendário ----------
type ChartType = 'e1rm' | 'volume' | 'calendar';
const chartWidth = Dimensions.get('window').width - 64;

const Gradient = ({ color }: { color: string }) => (
  <Defs key="gradient">
    <LinearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <Stop offset="0%" stopColor={color} stopOpacity={0.8} />
      <Stop offset="100%" stopColor={color} stopOpacity={0.1} />
    </LinearGradient>
  </Defs>
);

const AnalyticsChart: React.FC<{
  data: ChartDataPoint[];
  color: string;
  activeChart: ChartType;
}> = ({
  data,
  color,
  activeChart
}) => {
  
  const [activeData, setActiveData] = useState<any>(null);

  if (!data || data.length < 2) {
    return (
      <View style={styles.chartPlaceholder}>
        <BarChart3 color="#CBD5E0" size={48} />
        <Text style={styles.placeholderText}>
          {t.analytics.chartNoData}
        </Text>
        <Text style={styles.placeholderSubText}>
          {t.analytics.chartNoDataSubtitle}
        </Text>
      </View>
    );
  }

  const chartData = data.map((item, index) => ({
    x: index,
    y: item.value,
  }));
  const dateLabels = data.map((item) => {
    const localDate = parseLocalDate(item.date);
    return localDate.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
    });
  });
  const getTickValues = () => {
    if (data.length < 3) return [0, data.length - 1];
    const ticks = [0];
    if (data.length > 5) {
      ticks.push(Math.floor(data.length / 3));
      ticks.push(Math.floor((data.length / 3) * 2));
    } else if (data.length > 3) {
      ticks.push(Math.floor(data.length / 2));
    }
    ticks.push(data.length - 1);
    return [...new Set(ticks)];
  };
  const tickValues = getTickValues();

  const unit = activeChart === 'volume' ? 'kg' : 'e1RM';

  return (
    <View style={styles.chartContainer}>
      <VictoryChart
        width={chartWidth}
        height={220}
        padding={{ top: 40, bottom: 40, left: 50, right: 30 }}
        theme={VictoryTheme.material}
        containerComponent={
          <VictoryCursorContainer
            cursorDimension="x"
            cursorComponent={
              <Line
                stroke="#4A5568"
                strokeWidth={1}
                strokeDasharray="5, 5"
              />
            }
            onCursorChange={(value) => {
              if (typeof value === 'number') {
                const index = Math.round(value);
                if (chartData[index]) {
                  setActiveData(chartData[index]);
                }
              } else {
                setActiveData(null);
              }
            }}
          />
        }
      >
        <Gradient color={color} />
        <VictoryAxis
          tickValues={tickValues}
          tickFormat={(t) => dateLabels[t]}
          style={{
            tickLabels: { fontSize: 10, padding: 5, fill: '#718096' },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(y) => `${y.toFixed(0)}`}
          style={{
            tickLabels: { fontSize: 10, padding: 5, fill: '#718096' },
            grid: { stroke: '#E2E8F0', strokeDasharray: '4, 8' },
          }}
        />
        <VictoryArea
          data={chartData}
          interpolation="natural"
          style={{ data: { fill: 'url(#gradient)' } }}
        />
        <VictoryLine
          data={chartData}
          interpolation="natural"
          style={{ data: { stroke: color, strokeWidth: 3 } }}
        />

        {activeData && (
          <VictoryLabel
            text={`${activeData.y.toFixed(1)} ${unit}\n${
              dateLabels[activeData.x]
            }`}
            datum={activeData}
            textAnchor="middle"
            dy={-20}
            style={{ fill: '#1A202C', fontSize: 12, fontWeight: '600' }}
            backgroundStyle={{
              fill: 'white',
              stroke: '#E2E8F0',
              strokeWidth: 1,
            }}
            backgroundPadding={5}
          />
        )}
      </VictoryChart>
    </View>
  );
};

// --- Componente de Calendário ---
type MarkedDate = {
  [date: string]: { marked?: boolean; dotColor?: string; customStyles?: object };
};
const AnalyticsCalendar: React.FC<{ data: CalendarDay[] }> = ({ data }) => {
  const markedDates = useMemo(() => {
    return data.reduce((acc: MarkedDate, day: CalendarDay) => {
      const dateString = parseLocalDate(day.date).toISOString().split('T')[0];

      if (day.is_pr) {
        acc[dateString] = {
          customStyles: {
            container: { backgroundColor: '#F6E05E' },
            text: { color: '#1A202C', fontWeight: 'bold' },
          },
        };
      } else {
        acc[dateString] = {
          marked: true,
          dotColor: '#2B6CB0',
        };
      }
      return acc;
    }, {});
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <View style={styles.chartPlaceholder}>
        <CalendarDays color="#CBD5E0" size={48} />
        <Text style={styles.placeholderText}>{t.analytics.historyNoData}</Text>
      </View>
    );
  }

  const mostRecentDate = parseLocalDate(data[data.length - 1].date)
    .toISOString()
    .split('T')[0];

  return (
    <View style={styles.calendarWrapper}>
      <Calendar
        current={mostRecentDate}
        markingType={'custom'}
        markedDates={markedDates}
        theme={{
          backgroundColor: '#FFFFFF',
          calendarBackground: '#FFFFFF',
          textSectionTitleColor: '#4A5568',
          selectedDayBackgroundColor: '#2B6CB0',
          selectedDayTextColor: '#FFFFFF',
          todayTextColor: '#007AFF',
          dayTextColor: '#2D3748',
          textDisabledColor: '#CBD5E0',
          arrowColor: '#007AFF',
          monthTextColor: '#1A202C',
          textMonthFontWeight: 'bold',
          textDayHeaderFontWeight: 'bold',
          textDayFontSize: 14,
          textMonthFontSize: 18,
          textDayHeaderFontSize: 14,
        }}
      />
    </View>
  );
};

// --- Histórico ---
const HistoryList: React.FC<{ records: HistoricalSet[] }> = ({ records }) => {
  if (records.length === 0) {
    return (
      <View style={styles.historyPlaceholder}>
        <Trophy color="#CBD5E0" size={32} />
        <Text style={styles.placeholderText}>{t.analytics.historyNoData}</Text>
      </View>
    );
  }
  return (
    <View style={styles.historyListContainer}>
      {records.map((record) => {
        const localDate = parseLocalDate(record.date);
        return (
          <View key={record.date + record.e1rm} style={styles.historyItem}>
            <View style={styles.historyIcon}>
              <Trophy color="#D69E2E" size={16} />
            </View>
            <View style={styles.historyDetails}>
              <Text style={styles.historyText}>
                <Text style={styles.historyValue}>{record.weight} kg</Text> x{' '}
                {record.reps} reps
              </Text>
              <Text style={styles.historySubText}>
                e1RM: {record.e1rm.toFixed(1)} kg
              </Text>
            </View>
            <Text style={styles.historyDate}>
              {localDate.toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// ---------- Componente principal ----------
interface ExerciseAnalyticsSheetProps {}

export const ExerciseAnalyticsSheet = forwardRef<
  ExerciseAnalyticsSheetRef,
  ExerciseAnalyticsSheetProps
>((props, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ExerciseAnalyticsData | null>(
    null
  );

  const [activeChart, setActiveChart] = useState<ChartType>('volume');

  const [headerName, setHeaderName] = useState<string | null>(null);
  const [currentBestSetLocal, setCurrentBestSetLocal] =
    useState<CurrentBestSet | null>(null);
  const snapPoints = useMemo(() => ['60%', '85%'], []);

  const resolveExerciseIdByName = useCallback(async (name: string) => {
    if (!name) return null;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    const { data, error } = await supabase
      .from('exercises')
      .select('id, workout_id, workouts!inner(user_id, workout_date)')
      .eq('name', name)
      .eq('workouts.user_id', userData.user.id)
      .order('workout_date', { referencedTable: 'workouts', ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('Erro ao resolver ID pelo nome:', error.message);
      return null;
    }
    return data?.id ?? null;
  }, []);

  useImperativeHandle(ref, () => ({
    openSheet: async (
      definitionId: string,
      exerciseName: string,
      current: CurrentBestSet | null = null,
      studentId?: string // <--- Recebe aqui
    ) => {
      setHeaderName(exerciseName ?? null);
      setCurrentBestSetLocal(current ?? null);
      setError(null);
      setAnalytics(null);
      setIsLoading(true);
      sheetRef.current?.present();
      
      try {
        if (!definitionId) {
          // ... erro ...
          return;
        }

        // [MUDANÇA] Passa o studentId para o serviço
        const data = await fetchExerciseAnalytics(definitionId, studentId);
        setAnalytics(data);
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao carregar dados.');
      } finally {
        setIsLoading(false);
      }
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2B6CB0" />
          <Text style={styles.placeholderText}>{t.analytics.loading}</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centered}>
          <AlertCircle color="#E53E3E" size={48} />
          <Text style={styles.placeholderText}>{t.analytics.errorTitle}</Text>
          <Text style={styles.placeholderSubText}>{error}</Text>
        </View>
      );
    }
    if (!analytics) {
      return (
        <View style={styles.centered}>
          <History color="#CBD5E0" size={48} />
          <Text style={styles.placeholderText}>
            {t.analytics.errorNoData}
          </Text>
        </View>
      );
    }
    return (
      <BottomSheetScrollView contentContainerStyle={styles.scrollContainer}>
        {/* KPIs */}
        <View style={styles.kpiRow}>
          <PrStreakCard analytics={analytics} />
          <PerformanceCard
            current={currentBestSetLocal}
            previous={analytics.bestSetPreviousSession}
          />
        </View>

        {/* Gráficos e Calendário */}
        <View style={styles.section}>
          <View style={styles.chartToggle}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeChart === 'e1rm' && styles.toggleActive,
              ]}
              onPress={() => setActiveChart('e1rm')}
            >
              <TrendingUp
                color={activeChart === 'e1rm' ? '#2B6CB0' : '#4A5568'}
                size={16}
              />
              <Text
                style={[
                  styles.toggleText,
                  activeChart === 'e1rm' && styles.toggleActiveText,
                ]}
              >
                {t.analytics.chartToggleForce}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeChart === 'volume' && styles.toggleActive,
              ]}
              onPress={() => setActiveChart('volume')}
            >
              <BarChart3
                color={activeChart === 'volume' ? '#2B6CB0' : '#4A5568'}
                size={16}
              />
              <Text
                style={[
                  styles.toggleText,
                  activeChart === 'volume' && styles.toggleActiveText,
                ]}
              >
                {t.analytics.chartToggleVolume}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleButton,
                activeChart === 'calendar' && styles.toggleActive,
              ]}
              onPress={() => setActiveChart('calendar')}
            >
              <CalendarDays
                color={activeChart === 'calendar' ? '#2B6CB0' : '#4A5568'}
                size={16}
              />
              <Text
                style={[
                  styles.toggleText,
                  activeChart === 'calendar' && styles.toggleActiveText,
                ]}
              >
                Calendário
              </Text>
            </TouchableOpacity>
          </View>

          {activeChart === 'e1rm' && (
            <AnalyticsChart
              data={analytics.chartDataE1RM}
              color="#2B6CB0"
              activeChart="e1rm"
            />
          )}
          {activeChart === 'volume' && (
            <AnalyticsChart
              data={analytics.chartDataAccumulatedVolume}
              color="#38A169"
              activeChart="volume"
            />
          )}
          {activeChart === 'calendar' && (
            <AnalyticsCalendar data={analytics.calendarData} />
          )}
        </View>

        {/* Histórico PRs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Trophy color="#4A5568" size={18} />
            <Text style={styles.sectionTitle}>{t.analytics.historyTitle}</Text>
          </View>
          <HistoryList records={analytics.historicalPRsList} />
        </View>
      </BottomSheetScrollView>
    );
  };
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{headerName || t.analytics.title}</Text>
          <Text style={styles.subtitle}>{t.analytics.subtitle}</Text>
        </View>
        {renderContent()}
      </View>
    </BottomSheetModal>
  );
});

// ---------- Estilos ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  handle: { backgroundColor: '#E2E8F0' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1A202C' },
  subtitle: { fontSize: 14, color: '#4A5568' },
  scrollContainer: { padding: 16, paddingBottom: 48 },
  centered: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#4A5568',
    textAlign: 'center',
  },
  placeholderSubText: {
    marginTop: 4,
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  kpiTitle: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
  kpiContent: { alignItems: 'flex-start' },
  kpiValue: { fontSize: 30, fontWeight: 'bold', color: '#1A202C' },
  kpiUnit: { fontSize: 14, color: '#4A5568', marginTop: -4 },
  diffContainer: { flexDirection: 'column' },
  diffText: { fontSize: 16, fontWeight: 'bold', lineHeight: 22 },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  chartToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    padding: 4,
    width: '100%',
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginLeft: 6,
  },
  toggleActiveText: { color: '#2B6CB0' },
  chartContainer: { height: 220, width: chartWidth, alignItems: 'center' },
  chartPlaceholder: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  calendarWrapper: {
    width: '100%',
    minHeight: 370,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
    marginLeft: 8,
  },
  historyListContainer: { flexDirection: 'column', width: '100%' },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEFCEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyDetails: { flex: 1 },
  historyText: { fontSize: 16, color: '#2D3748' },
  historyValue: { fontWeight: '600' },
  historySubText: { fontSize: 14, color: '#718096' },
  historyDate: { fontSize: 14, color: '#718096' },
  historyPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    width: '100%',
  },
});