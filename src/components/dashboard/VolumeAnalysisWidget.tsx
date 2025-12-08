import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Canvas, RoundedRect, Line, vec, Skia, DashPathEffect, Rect } from "@shopify/react-native-skia";
import * as d3 from "d3";
import { Feather } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const GRAPH_HEIGHT = 280;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 50;
const AVAILABLE_HEIGHT = GRAPH_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const BAR_WIDTH = 22;
const BAR_GAP = 8;
const GROUP_PADDING = 30;
const ITEM_WIDTH = (BAR_WIDTH * 2) + BAR_GAP + GROUP_PADDING; 

export const VolumeAnalysisWidget = ({ tagStats, exerciseStats, filters, onToggleFilter }: any) => {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<'muscle' | 'exercise'>('muscle');

  const rawData = groupBy === 'muscle' ? tagStats : exerciseStats;
  
  const chartData = useMemo(() => {
    return rawData
      .map((d: any) => ({ 
        label: d.label, 
        avg: Math.floor(Number(d.weekly_sets)), 
        last: Number(d.last_week_sets) 
      }))
      .filter((d: any) => d.avg > 0 || d.last > 0)
      .sort((a: any, b: any) => b.last - a.last)
      .slice(0, 15);
  }, [rawData]);

  const minRef = groupBy === 'muscle' ? 10 : 1;
  const maxRef = groupBy === 'muscle' ? 20 : 5;
  const dataMax = Math.max(...chartData.map((d: any) => Math.max(d.avg, d.last)));
  const yMaxDomain = Math.max(dataMax, maxRef) * 1.2; 

  const yScale = d3.scaleLinear()
    .domain([0, yMaxDomain])
    .range([AVAILABLE_HEIGHT, 0]);

  const yZoneTop = yScale(maxRef) + PADDING_TOP;
  const yZoneBottom = yScale(minRef) + PADDING_TOP;
  const zoneHeight = yZoneBottom - yZoneTop;
  const canvasWidth = Math.max(width - 80, chartData.length * ITEM_WIDTH);

  // ESTILO 1: PÍLULAS COLORIDAS (Para Grupos/Exercícios)
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

  // ESTILO 2: CHECKBOX MINIMALISTA (Para Filtros de Série)
  const FilterCheckbox = ({ label, active, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={styles.viewModeBtn}>
       <Feather 
         name={active ? "check-circle" : "circle"} 
         size={16} 
         color={active ? "#6B46C1" : "#A0AEC0"} 
       />
       <Text style={[styles.viewModeText, active && { color: "#6B46C1", fontWeight: '800' }]}>
         {label}
       </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
         <View>
           <Text style={styles.title}>{t('dashboard.weeklyVolume')}</Text>
           <Text style={styles.subtitle}>Séries realizadas</Text>
         </View>
         
         {/* Toggle Principal (Estilo Pílula Colorida) */}
         <View style={styles.toggleRow}>
            <MainToggle label={t('dashboard.groups')} active={groupBy === 'muscle'} onPress={() => setGroupBy('muscle')} color="#6B46C1" />
            <MainToggle label={t('dashboard.exercises')} active={groupBy === 'exercise'} onPress={() => setGroupBy('exercise')} color="#3182CE" />
         </View>
      </View>

      {/* Filtros Secundários (Estilo Checkbox Minimalista) */}
      <View style={styles.filtersRow}>
        <FilterCheckbox label={t('dashboard.filterNormal')} active={filters.normal} onPress={() => onToggleFilter('normal')} />
        <FilterCheckbox label={t('dashboard.filterAdvanced')} active={filters.advanced} onPress={() => onToggleFilter('advanced')} />
        <FilterCheckbox label={t('dashboard.filterWarmup')} active={filters.warmup} onPress={() => onToggleFilter('warmup')} />
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#A0AEC0' }]} />
          <Text style={styles.legendText}>Média Histórica</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#6B46C1' }]} />
          <Text style={styles.legendText}>Esta Semana</Text>
        </View>
      </View>

      {chartData.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('dashboard.noDataChart')}</Text>
        </View>
      ) : (
        <View style={styles.chartArea}>
          
          <View style={styles.yAxisFixed}>
            {yScale.ticks(5).map((tick, i) => (
              <Text key={i} style={[styles.yAxisLabel, { position: 'absolute', top: yScale(tick) + PADDING_TOP - 8 }]}>
                {tick}
              </Text>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 10, paddingRight: 40 }}>
            <View style={{ width: canvasWidth, height: GRAPH_HEIGHT }}>
              <Canvas style={{ flex: 1 }}>
                {/* Zona Ideal */}
                <Rect x={0} y={yZoneTop} width={canvasWidth} height={zoneHeight} color="rgba(72, 187, 120, 0.1)" />
                
                {/* Grades */}
                {yScale.ticks(5).map((tick, i) => (
                  <Line key={`grid-${i}`} p1={vec(0, yScale(tick) + PADDING_TOP)} p2={vec(canvasWidth, yScale(tick) + PADDING_TOP)} color="#E2E8F0" strokeWidth={1} />
                ))}

                {/* Linhas Pontilhadas */}
                <Line p1={vec(0, yZoneTop)} p2={vec(canvasWidth, yZoneTop)} color="#38A169" strokeWidth={1.5}><DashPathEffect intervals={[6, 4]} /></Line>
                <Line p1={vec(0, yZoneBottom)} p2={vec(canvasWidth, yZoneBottom)} color="#38A169" strokeWidth={1.5}><DashPathEffect intervals={[6, 4]} /></Line>

                {/* Barras */}
                {chartData.map((item: any, index: number) => {
                  const xStart = index * ITEM_WIDTH;
                  const heightAvg = AVAILABLE_HEIGHT - yScale(item.avg);
                  const yAvg = yScale(item.avg) + PADDING_TOP;
                  const heightLast = AVAILABLE_HEIGHT - yScale(item.last);
                  const yLast = yScale(item.last) + PADDING_TOP;

                  return (
                    <React.Fragment key={index}>
                      <RoundedRect x={xStart} y={yAvg} width={BAR_WIDTH} height={heightAvg} r={4} color="#A0AEC0" />
                      <RoundedRect x={xStart + BAR_WIDTH + BAR_GAP} y={yLast} width={BAR_WIDTH} height={heightLast} r={4} color="#6B46C1" />
                    </React.Fragment>
                  );
                })}
              </Canvas>

              {/* Rótulos */}
              {chartData.map((item: any, index: number) => {
                 const xStart = index * ITEM_WIDTH;
                 const yAvg = yScale(item.avg) + PADDING_TOP;
                 const yLast = yScale(item.last) + PADDING_TOP;
                 const groupCenter = xStart + (BAR_WIDTH * 2 + BAR_GAP) / 2;
                 const labelWidth = ITEM_WIDTH + 10;

                 return (
                   <React.Fragment key={`labels-${index}`}>
                      {item.avg > 0 && <Text style={[styles.barLabel, { left: xStart - 5, top: yAvg - 18, width: BAR_WIDTH + 10, color: '#718096' }]}>{item.avg}</Text>}
                      {item.last > 0 && <Text style={[styles.barLabel, { left: xStart + BAR_WIDTH + BAR_GAP - 5, top: yLast - 18, width: BAR_WIDTH + 10, color: '#553C9A', fontWeight: '900' }]}>{item.last}</Text>}
                      <Text style={[styles.xAxisLabel, { left: groupCenter - (labelWidth/2), width: labelWidth }]} numberOfLines={2}>{item.label}</Text>
                   </React.Fragment>
                 )
              })}
            </View>
          </ScrollView>

          {/* LABEL ZONA IDEAL (Direita) */}
          <View style={[styles.rightZoneLabel, { top: yZoneTop, height: zoneHeight }]}>
              <View style={styles.verticalTextContainer}>
                  <Text style={styles.verticalText}>ZONA IDEAL</Text>
              </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EDF2F7', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, elevation: 2 },
  header: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#1A202C' },
  subtitle: { fontSize: 13, color: '#718096', marginBottom: 8 },
  
  // ESTILO 1: Pílulas
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metricChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  metricChipInactive: { backgroundColor: '#F7FAFC', borderColor: '#E2E8F0' },
  metricText: { fontSize: 12, fontWeight: '600', color: '#718096' },
  textInactive: { color: '#718096' },

  // ESTILO 2: Checkbox Minimalista
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EDF2F7', paddingBottom: 10 },
  viewModeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewModeText: { fontSize: 13, fontWeight: '600', color: '#A0AEC0' },

  legendRow: { flexDirection: 'row', gap: 20, marginBottom: 12, paddingLeft: 40 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 13, color: '#4A5568', fontWeight: '600' },

  emptyState: { height: 150, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#A0AEC0', fontSize: 16 },

  chartArea: { flexDirection: 'row', height: GRAPH_HEIGHT },
  yAxisFixed: { width: 35, height: '100%', borderRightWidth: 1, borderRightColor: '#EDF2F7', marginRight: 0, backgroundColor: '#FFF', zIndex: 10 },
  yAxisLabel: { fontSize: 12, color: '#718096', fontWeight: '700', textAlign: 'right', paddingRight: 8, width: '100%' },

  rightZoneLabel: { position: 'absolute', right: 0, width: 20, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(56, 161, 105, 0.3)', backgroundColor: 'rgba(255,255,255,0.8)', zIndex: 20 },
  verticalTextContainer: { transform: [{ rotate: '-90deg' }], width: 120, alignItems: 'center', justifyContent: 'center' },
  verticalText: { fontSize: 10, fontWeight: '900', color: '#38A169', letterSpacing: 1 },

  barLabel: { position: 'absolute', fontSize: 11, textAlign: 'center', fontWeight: '700' },
  xAxisLabel: { position: 'absolute', bottom: 0, fontSize: 11, fontWeight: '700', color: '#2D3748', textAlign: 'center', lineHeight: 14 },
});