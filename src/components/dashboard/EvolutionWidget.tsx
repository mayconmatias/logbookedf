import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Canvas, Path, LinearGradient, vec, Skia, Circle, Line } from "@shopify/react-native-skia";
import * as d3 from "d3";
import { Feather } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const GRAPH_HEIGHT = 260;
const POINT_GAP = 70; 
const PADDING_TOP = 20;
const PADDING_BOTTOM = 40;
const AVAILABLE_HEIGHT = GRAPH_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const formatDateShort = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length < 3 ? dateStr : `${parts[2]}/${parts[1]}`;
};

export const EvolutionWidget = ({ weeklyData, dailyData }: any) => {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<'volume' | 'density'>('volume');
  const [viewMode, setViewMode] = useState<'week' | 'session'>('session');

  const data = useMemo(() => {
     const source = viewMode === 'week' ? weeklyData : dailyData;
     return source.map((d: any) => ({ date: d.date, value: Number(d[metric]) || 0 }));
  }, [viewMode, metric, weeklyData, dailyData]);

  const hasData = data && data.length >= 2;
  const color = metric === 'volume' ? "#3182CE" : "#DD6B20";
  
  const canvasWidth = Math.max(width - 80, data.length * POINT_GAP);
  const yMax = Math.max(...data.map((d: any) => d.value)) * 1.15; 

  const xScale = d3.scaleLinear()
    .domain([0, Math.max(1, data.length - 1)])
    .range([20, canvasWidth - 20]);

  const yScale = d3.scaleLinear()
    .domain([0, yMax])
    .range([AVAILABLE_HEIGHT, 0]);

  const lineGenerator = d3.line<any>()
    .x((_, i) => xScale(i))
    .y(d => yScale(d.value) + PADDING_TOP)
    .curve(d3.curveMonotoneX);

  const areaGenerator = d3.area<any>()
    .x((_, i) => xScale(i))
    .y0(AVAILABLE_HEIGHT + PADDING_TOP)
    .y1(d => yScale(d.value) + PADDING_TOP)
    .curve(d3.curveMonotoneX);

  const linePath = Skia.Path.MakeFromSVGString(lineGenerator(data) || "")!;
  const areaPath = Skia.Path.MakeFromSVGString(areaGenerator(data) || "")!;

  // Estilo Pílula (Igual ao Volume)
  const MainToggle = ({ label, active, onPress, color }: any) => (
      <TouchableOpacity 
        onPress={onPress} 
        style={[
            styles.metricChip, 
            active ? { backgroundColor: '#EBF8FF', borderColor: color } : styles.metricChipInactive
        ]}
      >
         <Text style={[styles.metricText, active ? { color: color } : styles.textInactive]}>
            {label}
         </Text>
      </TouchableOpacity>
  );

  // Estilo Checkbox Minimalista (Igual ao Volume)
  const ViewModeCheckbox = ({ label, active, onPress }: any) => (
      <TouchableOpacity onPress={onPress} style={styles.viewModeBtn}>
         <Feather name={active ? "check-circle" : "circle"} size={16} color={active ? color : "#A0AEC0"} />
         <Text style={[styles.viewModeText, active && {color, fontWeight: '800'}]}>{label}</Text>
      </TouchableOpacity>
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('dashboard.loadEvolution')}</Text>
          <Text style={styles.subtitle}>
            {metric === 'volume' ? 'Volume Total (kg)' : 'Densidade (kg/min)'}
          </Text>
        </View>
        
        {/* Toggle Principal */}
        <View style={styles.toggleRow}>
           <MainToggle label="Volume" active={metric === 'volume'} onPress={() => setMetric('volume')} color="#3182CE" />
           <MainToggle label="Densidade" active={metric === 'density'} onPress={() => setMetric('density')} color="#DD6B20" />
        </View>
      </View>

      {/* Checkboxes Secundários */}
      <View style={styles.filtersRow}>
          <ViewModeCheckbox label={t('dashboard.bySession')} active={viewMode === 'session'} onPress={() => setViewMode('session')} />
          <ViewModeCheckbox label={t('dashboard.byWeek')} active={viewMode === 'week'} onPress={() => setViewMode('week')} />
      </View>

      {!hasData ? (
         <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('dashboard.noDataChart')}</Text>
         </View>
      ) : (
        <View style={styles.chartArea}>
           
           <View style={styles.yAxisFixed}>
              {yScale.ticks(5).map((tick, i) => (
                <Text key={i} style={[styles.yAxisLabel, { position: 'absolute', top: yScale(tick) + PADDING_TOP - 8 }]}>
                  {tick >= 1000 ? `${(tick/1000).toFixed(1)}k` : Math.round(tick)}
                </Text>
              ))}
           </View>

           <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 30 }}>
              <View style={{ width: canvasWidth, height: GRAPH_HEIGHT }}>
                 <Canvas style={{ flex: 1 }}>
                    {yScale.ticks(5).map((tick, i) => (
                      <Line key={`grid-${i}`} p1={vec(0, yScale(tick) + PADDING_TOP)} p2={vec(canvasWidth, yScale(tick) + PADDING_TOP)} color="#E2E8F0" strokeWidth={1} />
                    ))}
                    <Path path={areaPath}><LinearGradient start={vec(0, 0)} end={vec(0, GRAPH_HEIGHT)} colors={[color, "transparent"]} positions={[0, 0.8]} /></Path>
                    <Path path={linePath} color={color} style="stroke" strokeWidth={3} strokeCap="round" />
                    {data.map((d: any, i: number) => (
                      <Circle key={i} cx={xScale(i)} cy={yScale(d.value) + PADDING_TOP} r={5} color={color} />
                    ))}
                 </Canvas>
                 {data.map((d: any, i: number) => (
                   <React.Fragment key={i}>
                     {(i === data.length - 1 || d.value > yMax * 0.8) && (
                       <Text style={[styles.valLabel, { left: xScale(i) - 30, top: yScale(d.value) + PADDING_TOP - 22, color }]}>
                         {d.value >= 1000 ? (d.value/1000).toFixed(1) + 'k' : Math.round(d.value)}
                       </Text>
                     )}
                     <Text style={[styles.dateLabel, { left: xScale(i) - 20 }]}>{formatDateShort(d.date)}</Text>
                   </React.Fragment>
                 ))}
              </View>
           </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EDF2F7', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, elevation: 2 },
  header: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#1A202C' },
  subtitle: { fontSize: 13, color: '#718096', marginBottom: 12 },
  
  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  metricChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  metricChipInactive: { backgroundColor: '#F7FAFC', borderColor: '#E2E8F0' },
  metricText: { fontSize: 12, fontWeight: '600', color: '#718096' },
  textInactive: { color: '#718096' },

  filtersRow: { flexDirection: 'row', gap: 20, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EDF2F7', paddingBottom: 10 },
  viewModeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewModeText: { fontSize: 13, fontWeight: '600', color: '#A0AEC0' },

  emptyState: { height: 150, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#A0AEC0', fontSize: 16 },

  chartArea: { flexDirection: 'row', height: GRAPH_HEIGHT },
  yAxisFixed: { width: 35, height: '100%', borderRightWidth: 1, borderRightColor: '#EDF2F7', marginRight: 0, backgroundColor: '#FFF', zIndex: 10 },
  yAxisLabel: { fontSize: 12, color: '#718096', fontWeight: '700', textAlign: 'right', paddingRight: 8, width: '100%' },

  valLabel: { position: 'absolute', width: 60, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  dateLabel: { position: 'absolute', bottom: 0, width: 40, textAlign: 'center', fontSize: 11, color: '#4A5568', fontWeight: '600' }
});