import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Platform,
  UIManager,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Feather } from '@expo/vector-icons';
import { toast } from 'sonner-native';
import moment from 'moment';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';

// SKIA & D3
import { 
  Canvas, Path, LinearGradient as SkiaLinearGradient, vec, Circle, Line, Group, Skia, Rect
} from "@shopify/react-native-skia";
import * as d3 from "d3";

import { fetchExerciseAnalytics } from '@/services/progression.service';
import { fetchPerformancePeek } from '@/services/exercises.service';
import { ExerciseAnalyticsData, CurrentBestSet, ChartDataPoint } from '@/types/analytics';
import { PerformanceSet } from '@/types/workout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ExerciseAnalyticsSheetRef = {
  openSheet: (
    definitionId: string,
    exerciseName: string,
    currentBestSet?: CurrentBestSet | null,
    studentId?: string,
    excludeWorkoutId?: string
  ) => void;
  close: () => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRAPH_HEIGHT = 240;
const CHART_TOP_PADDING = 30;
const CHART_BOTTOM_PADDING = 30; // Espaço para datas
const AVAILABLE_HEIGHT = GRAPH_HEIGHT - CHART_TOP_PADDING - CHART_BOTTOM_PADDING;
const POINT_WIDTH = 70; // Mais largo para caber rótulos

// --- NOVO GRÁFICO PROFISSIONAL ---
const ProChart = ({ 
  data, 
  color, 
  type = 'line',
  unit,
  currentBest 
}: { 
  data: ChartDataPoint[], 
  color: string, 
  type?: 'line' | 'scatter',
  unit: string,
  currentBest?: CurrentBestSet | null
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const opacity = useSharedValue(0);

  // 1. Dados
  const chartData = useMemo(() => {
    const baseData = [...data];
    if (currentBest && currentBest.e1rm > 0) {
      baseData.push({
        date: new Date().toISOString(),
        value: currentBest.e1rm
      });
    }
    return baseData;
  }, [data, currentBest]);

  if (!chartData || chartData.length === 0) {
    return (
      <View style={styles.chartPlaceholder}>
        <Feather name="bar-chart-2" size={32} color="#CBD5E0" />
        <Text style={styles.placeholderText}>Histórico insuficiente.</Text>
      </View>
    );
  }

  const isSinglePoint = chartData.length === 1;
  // Ponto fantasma para D3 não quebrar se for único
  const renderData = isSinglePoint ? [chartData[0], chartData[0]] : chartData;

  const totalWidth = Math.max(SCREEN_WIDTH - 60, chartData.length * POINT_WIDTH); // -60 para dar espaço ao Eixo Y fixo

  // 2. Escalas
  const yValues = chartData.map(d => d.value);
  const yMax = Math.max(...yValues) * 1.1; 
  const yMin = Math.min(...yValues) * 0.9;

  const xScale = d3.scaleLinear()
    .domain([0, isSinglePoint ? 1 : chartData.length - 1])
    .range([POINT_WIDTH / 2, totalWidth - (POINT_WIDTH / 2)]);

  const yScale = d3.scaleLinear()
    .domain([yMin > 0 ? yMin : 0, yMax || 10])
    .range([AVAILABLE_HEIGHT, 0]); // Invertido: 0 no topo (maior valor), Height na base

  // Ticks do Eixo Y (5 divisões)
  const yTicks = yScale.ticks(5);

  // Geradores SVG
  const lineGenerator = d3.line<any>()
    .x((_, i) => xScale(i))
    .y(d => yScale(d.value) + CHART_TOP_PADDING)
    .curve(d3.curveMonotoneX);

  const areaGenerator = d3.area<any>()
    .x((_, i) => xScale(i))
    .y0(AVAILABLE_HEIGHT + CHART_TOP_PADDING)
    .y1(d => yScale(d.value) + CHART_TOP_PADDING)
    .curve(d3.curveMonotoneX);

  const linePath = Skia.Path.MakeFromSVGString(lineGenerator(renderData) || "")!;
  const areaPath = Skia.Path.MakeFromSVGString(areaGenerator(renderData) || "")!;

  // Gesto
  const gesture = Gesture.Pan()
    .onBegin(() => opacity.value = withTiming(1))
    .onUpdate((e) => {
      if (isSinglePoint) { runOnJS(setActiveIndex)(0); return; }
      const relativeX = e.x - (POINT_WIDTH / 2);
      const usefulWidth = totalWidth - POINT_WIDTH;
      const progress = Math.max(0, Math.min(1, relativeX / usefulWidth));
      const idx = Math.round(progress * (chartData.length - 1));
      if (idx >= 0 && idx < chartData.length) runOnJS(setActiveIndex)(idx);
    })
    .onFinalize(() => { opacity.value = withTiming(0); runOnJS(setActiveIndex)(null); });

  const activePoint = activeIndex !== null ? chartData[activeIndex] : null;

  return (
    <View style={styles.chartRow}>
      {/* EIXO Y FIXO (Esquerda) */}
      <View style={styles.yAxisContainer}>
        {yTicks.map((tick, i) => (
          <Text key={i} style={[styles.yAxisLabel, { 
            position: 'absolute', 
            top: yScale(tick) + CHART_TOP_PADDING - 6 // Centraliza verticalmente com a linha
          }]}>
            {tick >= 1000 ? `${(tick/1000).toFixed(1)}k` : Math.round(tick)}
          </Text>
        ))}
      </View>

      {/* ÁREA DE SCROLL (Gráfico) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
        <GestureDetector gesture={gesture}>
          <View>
            {/* 1. LAYOUT DE TEXTO (Rótulos e Datas) - Fora do Canvas para nitidez */}
            <View style={{ width: totalWidth, height: GRAPH_HEIGHT, position: 'absolute', zIndex: 1 }}>
               {chartData.map((d, i) => {
                 const xPos = xScale(i);
                 const yPos = yScale(d.value) + CHART_TOP_PADDING;
                 const isToday = moment(d.date).isSame(new Date(), 'day');
                 const isHigh = activeIndex === i;

                 return (
                   <React.Fragment key={i}>
                     {/* Rótulo de Valor (Acima do ponto) */}
                     <View style={[styles.pointLabelContainer, { left: xPos - 30, top: yPos - 24 }]}>
                        <Text style={[styles.pointLabel, isHigh && { color, fontWeight: '900', fontSize: 13 }]}>
                          {Math.round(d.value)}
                        </Text>
                     </View>

                     {/* Rótulo de Data (Eixo X) */}
                     <View style={[styles.dateLabelContainer, { left: xPos - 25, bottom: 2 }]}>
                        <Text style={[styles.dateLabel, isToday && { color, fontWeight: '800' }]}>
                          {isToday ? 'HOJE' : moment(d.date).format('DD/MM')}
                        </Text>
                     </View>
                   </React.Fragment>
                 )
               })}
            </View>

            {/* 2. DESENHO GRÁFICO (Canvas) */}
            <View style={{ width: totalWidth, height: GRAPH_HEIGHT }}>
              <Canvas style={{ flex: 1 }}>
                {/* Linhas de Grade Horizontais */}
                {yTicks.map((tick, i) => (
                  <Line 
                    key={`grid-${i}`} 
                    p1={vec(0, yScale(tick) + CHART_TOP_PADDING)} 
                    p2={vec(totalWidth, yScale(tick) + CHART_TOP_PADDING)} 
                    color="#F0F0F0" 
                    strokeWidth={1} 
                  />
                ))}

                {isSinglePoint ? (
                   <Group>
                      {/* Linha de referência visual para ponto único */}
                      <Line 
                        p1={vec(0, yScale(chartData[0].value) + CHART_TOP_PADDING)} 
                        p2={vec(totalWidth, yScale(chartData[0].value) + CHART_TOP_PADDING)} 
                        color={color} 
                        style="stroke" 
                        strokeWidth={1} 
                      >
                         <SkiaLinearGradient start={vec(0,0)} end={vec(totalWidth,0)} colors={['transparent', color, 'transparent']} />
                      </Line>
                      <Circle cx={totalWidth/2} cy={yScale(chartData[0].value) + CHART_TOP_PADDING} r={6} color={color} />
                      <Circle cx={totalWidth/2} cy={yScale(chartData[0].value) + CHART_TOP_PADDING} r={3} color="#FFF" />
                   </Group>
                ) : (
                  <>
                    {type === 'line' && (
                      <Path path={areaPath}>
                        <SkiaLinearGradient start={vec(0, CHART_TOP_PADDING)} end={vec(0, GRAPH_HEIGHT)} colors={[color + '33', color + '00']} />
                      </Path>
                    )}
                    {type === 'line' && (
                      <Path path={linePath} color={color} style="stroke" strokeWidth={3} strokeCap="round" />
                    )}
                    {chartData.map((d, i) => (
                      <Group key={i}>
                        <Circle cx={xScale(i)} cy={yScale(d.value) + CHART_TOP_PADDING} r={4} color={color} />
                        <Circle cx={xScale(i)} cy={yScale(d.value) + CHART_TOP_PADDING} r={2} color="#FFF" />
                      </Group>
                    ))}
                  </>
                )}

                {/* Cursor de Interação */}
                {activeIndex !== null && (
                  <Line 
                    p1={vec(xScale(activeIndex), CHART_TOP_PADDING)} 
                    p2={vec(xScale(activeIndex), AVAILABLE_HEIGHT + CHART_TOP_PADDING)} 
                    color={color} 
                    strokeWidth={1}
                    style="stroke" 
                  />
                )}
              </Canvas>
            </View>
          </View>
        </GestureDetector>
      </ScrollView>
    </View>
  );
};

// --- (CÓDIGO EXISTENTE: MotivationHeader, LastSessionList) ---
const MotivationHeader = ({ analytics }: { analytics: ExerciseAnalyticsData }) => {
  const { prStreakCount, daysSinceLastPR } = analytics;
  if (prStreakCount >= 2) return <View style={[styles.insightCard, styles.insightGreen]}><Feather name="trending-up" size={24} color="#2F855A" /><View style={{flex:1}}><Text style={[styles.insightTitle, {color:'#22543D'}]}>Em chamas! 🔥</Text><Text style={[styles.insightText, {color:'#2F855A'}]}>Recordes em {prStreakCount} treinos seguidos.</Text></View></View>;
  if (daysSinceLastPR > 30) return <View style={[styles.insightCard, styles.insightRed]}><Feather name="alert-circle" size={24} color="#C53030" /><View style={{flex:1}}><Text style={[styles.insightTitle, {color:'#742A2A'}]}>Quebrar platô? 🔨</Text><Text style={[styles.insightText, {color:'#C53030'}]}>Faz {daysSinceLastPR} dias do último PR.</Text></View></View>;
  return <View style={[styles.insightCard, styles.insightBlue]}><Feather name="activity" size={24} color="#2B6CB0" /><View style={{flex:1}}><Text style={[styles.insightTitle, {color:'#2A4365'}]}>Construindo base 🏗️</Text><Text style={[styles.insightText, {color:'#2B6CB0'}]}>Mantenha a consistência.</Text></View></View>;
};

const LastSessionList = ({ sets }: { sets: PerformanceSet[] }) => {
  const validSets = sets.filter(s => s.weight > 0 || s.reps > 0);
  if (validSets.length === 0) return <View style={styles.emptyContainer}><Text style={styles.emptyText}>Sem dados válidos da última sessão.</Text></View>;
  return (
    <View style={styles.lastSessionContainer}>
      {validSets.map((set, idx) => (
        <View key={idx} style={styles.lastSessionRow}>
          <View style={styles.setIndexBadge}><Text style={styles.setIndexText}>#{set.set_number}</Text></View>
          <View style={styles.setMainInfo}><Text style={styles.setWeight}>{set.weight} <Text style={styles.unit}>kg</Text></Text><Text style={styles.setX}>×</Text><Text style={styles.setReps}>{set.reps} <Text style={styles.unit}>reps</Text></Text></View>
          {set.rpe && <View style={styles.rpeBadge}><Text style={styles.rpeText}>@{set.rpe}</Text></View>}
        </View>
      ))}
    </View>
  );
};

export const ExerciseAnalyticsSheet = forwardRef<ExerciseAnalyticsSheetRef, {}>((props, ref) => {
  const sheetRef = useRef<TrueSheet>(null);
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<ExerciseAnalyticsData | null>(null);
  const [lastSessionSets, setLastSessionSets] = useState<PerformanceSet[]>([]);
  const [title, setTitle] = useState('');
  const [chartMode, setChartMode] = useState<'force' | 'volume'>('force');
  const [currentBest, setCurrentBest] = useState<CurrentBestSet | null>(null);

  const loadData = async (definitionId: string, studentId?: string, excludeWorkoutId?: string) => {
    setLoading(true);
    try {
      const data = await fetchExerciseAnalytics(definitionId, studentId);
      setAnalytics(data);
      
      const peek = await fetchPerformancePeek(definitionId, excludeWorkoutId, studentId);
      // Fallback Visual: Se a última sessão retornada for a de HOJE e estiver vazia, tenta pegar a anterior real
      const isTodayEmpty = peek.lastPerformance.some(s => moment(s.workout_date).isSame(moment(), 'day') && s.weight === 0);
      
      if (isTodayEmpty && data.bestSetPreviousSession) {
         setLastSessionSets([]); // Ou lógica de fallback mais complexa se desejar
      } else {
         setLastSessionSets(peek.lastPerformance || []);
      }
    } catch (e) {
      toast.error('Erro ao carregar histórico.');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openSheet: (defId, name, current, studentId, excludeWorkoutId) => {
      setTitle(name);
      setCurrentBest(current || null);
      sheetRef.current?.present(0);
      if (defId) loadData(defId, studentId, excludeWorkoutId);
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const renderContent = () => {
    if (loading) return <ActivityIndicator style={{marginTop: 60}} size="large" color="#007AFF" />;
    if (!analytics) return <View style={styles.emptyContainer}><Text style={styles.emptyText}>Não foi possível carregar os dados.</Text></View>;

    return (
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <MotivationHeader analytics={analytics} />
        
        {/* SESSÃO ANTERIOR */}
        <View style={styles.section}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8}}>
             <Feather name="rotate-ccw" size={16} color="#718096" />
             <Text style={styles.sectionTitle}>Sessão Anterior</Text>
          </View>
          <LastSessionList sets={lastSessionSets} />
        </View>

        {/* GRÁFICOS */}
        <View style={styles.section}>
          <View style={styles.chartHeader}>
             <Text style={styles.sectionTitle}>Evolução</Text>
             <View style={styles.chartToggle}>
                <TouchableOpacity onPress={() => setChartMode('force')}><Text style={[styles.toggleText, chartMode === 'force' && styles.toggleActive]}>Força</Text></TouchableOpacity>
                <View style={styles.verticalDivider} />
                <TouchableOpacity onPress={() => setChartMode('volume')}><Text style={[styles.toggleText, chartMode === 'volume' && styles.toggleActive]}>Volume</Text></TouchableOpacity>
             </View>
          </View>
          <View style={styles.chartWrapper}>
            {chartMode === 'force' ? 
              <ProChart data={analytics.chartDataE1RM} color="#007AFF" type="scatter" unit="kg" currentBest={currentBest} /> : 
              <ProChart data={analytics.chartDataAccumulatedVolume} color="#805AD5" type="line" unit="kg" />
            }
          </View>
        </View>

        {/* HISTÓRICO DE RECORDES */}
        <View style={styles.section}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8}}>
             <Feather name="award" size={16} color="#D69E2E" />
             <Text style={styles.sectionTitle}>Recordes (PRs)</Text>
          </View>
          {analytics.historicalPRsList.length === 0 ? 
            <Text style={styles.emptyText}>Ainda sem recordes registrados.</Text> : 
            analytics.historicalPRsList.map((pr, i) => (
              <View key={i} style={styles.prRow}>
                <Text style={styles.prDate}>{moment(pr.date).format('DD/MM/YYYY')}</Text>
                <View style={styles.prValues}>
                   <Text style={styles.prMainValue}>{pr.weight}kg x {pr.reps}</Text>
                   <Text style={styles.prSubValue}>e1RM: {pr.e1rm.toFixed(1)}kg</Text>
                </View>
              </View>
            ))
          }
        </View>
        <View style={{height: 40}} />
      </ScrollView>
    );
  };

  return (
    <TrueSheet ref={sheetRef} sizes={['large']} cornerRadius={24} backgroundColor="#F7FAFC">
      <View style={styles.sheetContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={() => sheetRef.current?.dismiss()} style={styles.closeBtn}><Feather name="x" size={24} color="#A0AEC0" /></TouchableOpacity>
        </View>
        {renderContent()}
      </View>
    </TrueSheet>
  );
});

const styles = StyleSheet.create({
  sheetContainer: { flex: 1, backgroundColor: '#F7FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFF' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A202C', flex: 1 },
  closeBtn: { padding: 4 },
  contentContainer: { padding: 16 },
  
  // Charts
  chartRow: { flexDirection: 'row', height: GRAPH_HEIGHT, alignItems: 'flex-end' },
  yAxisContainer: { width: 35, height: '100%', borderRightWidth: 1, borderRightColor: '#F0F0F0', marginRight: 0 },
  yAxisLabel: { fontSize: 10, color: '#A0AEC0', textAlign: 'right', paddingRight: 6, width: '100%' },
  
  pointLabelContainer: { position: 'absolute', width: 60, alignItems: 'center' },
  pointLabel: { fontSize: 11, fontWeight: '600', color: '#4A5568' },
  dateLabelContainer: { position: 'absolute', width: 50, alignItems: 'center' },
  dateLabel: { fontSize: 10, color: '#A0AEC0', fontWeight: '500' },

  chartWrapper: { width: '100%' },
  chartPlaceholder: { height: 180, justifyContent: 'center', alignItems: 'center', width: '100%' },
  placeholderText: { color: '#A0AEC0', marginTop: 8, fontSize: 13 },
  
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  chartToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDF2F7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 12 },
  verticalDivider: { width: 1, height: 12, backgroundColor: '#CBD5E0' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#A0AEC0' },
  toggleActive: { color: '#007AFF', fontWeight: '800' },

  // Insight Cards
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  insightGreen: { backgroundColor: '#F0FFF4', borderColor: '#C6F6D5' },
  insightRed: { backgroundColor: '#FFF5F5', borderColor: '#FED7D7' },
  insightBlue: { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' },
  insightTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  insightText: { fontSize: 13, lineHeight: 18 },
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5 },
  lastSessionContainer: { gap: 0 },
  lastSessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F7FAFC' },
  setIndexBadge: { backgroundColor: '#EDF2F7', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  setIndexText: { fontSize: 11, fontWeight: '700', color: '#718096' },
  setMainInfo: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  setWeight: { fontSize: 18, fontWeight: '800', color: '#2D3748' },
  setReps: { fontSize: 18, fontWeight: '800', color: '#2D3748' },
  setX: { fontSize: 14, color: '#CBD5E0', marginHorizontal: 4 },
  unit: { fontSize: 12, fontWeight: '500', color: '#A0AEC0' },
  rpeBadge: { backgroundColor: '#F7FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#EDF2F7' },
  rpeText: { fontSize: 11, fontWeight: '700', color: '#718096' },
  
  // Tooltip
  tooltipContainer: { position: 'absolute', top: -10, left: 0, right: 0, alignItems: 'center', zIndex: 99 },
  tooltipBadge: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 2, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  tooltipDate: { fontSize: 10, color: '#718096', fontWeight: '700', marginBottom: 2 },
  tooltipValue: { fontSize: 16, fontWeight: '900' },
  
  prRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F7FAFC' },
  prDate: { fontSize: 13, color: '#718096', fontWeight: '500' },
  prValues: { alignItems: 'flex-end' },
  prMainValue: { fontSize: 15, fontWeight: '700', color: '#2D3748' },
  prSubValue: { fontSize: 11, color: '#A0AEC0', fontWeight: '500' },
  emptyContainer: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#A0AEC0', fontStyle: 'italic' },
});