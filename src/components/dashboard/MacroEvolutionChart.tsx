import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import {
  Canvas, Path, Rect, Line, Skia, DashPathEffect,
  LinearGradient, vec, Group, Circle, RoundedRect
} from '@shopify/react-native-skia';
import * as d3 from 'd3';
import { Feather } from '@expo/vector-icons';
import { EvolutionPoint } from '@/services/evolution.service';
import { calculateTrendLine, generateCurvedPath } from '@/utils/chartMath';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 280;
const TOP_PADDING = 40;
const BOTTOM_PADDING = 40; // Espaço para as datas
const GRAPH_HEIGHT = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING;
const ITEM_WIDTH = 80; // Mais largo para caber texto maior

interface Props {
  data: EvolutionPoint[];
  colorVolume?: string;
  colorReps?: string;
  title?: string;
}

export const MacroEvolutionChart = ({
  data,
  colorVolume = '#805AD5', // Roxo
  colorReps = '#319795',   // Teal (Mais escuro que antes)
  title = "Macro Evolução"
}: Props) => {

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Feather name="bar-chart-2" size={32} color="#CBD5E0" />
        <Text style={styles.emptyText}>Sem dados suficientes para análise Macro.</Text>
      </View>
    );
  }

  // Define largura total do Canvas
  const CANVAS_WIDTH = Math.max(SCREEN_WIDTH - 60, data.length * ITEM_WIDTH);

  // --- CÁLCULOS D3 ---
  const { paths, scales, trends, ticks } = useMemo(() => {
    // 1. Extremos
    const maxVol = Math.max(...data.map(d => d.volume)) || 100;
    const maxReps = Math.max(...data.map(d => d.avgReps)) || 10;

    // 2. Escalas
    const scaleX = d3.scaleLinear()
      .domain([0, data.length - 1])
      .range([ITEM_WIDTH / 2, CANVAS_WIDTH - (ITEM_WIDTH / 2)]);

    // Eixo Y1 (Volume) - Usamos isso para a linha e para o Eixo Y lateral
    const scaleYVol = d3.scaleLinear()
      .domain([0, maxVol * 1.2])
      .range([GRAPH_HEIGHT, 0]); // 0 no topo do graph area

    // Ticks para o Eixo Y Lateral (5 divisões)
    const volTicks = scaleYVol.ticks(5);

    // Eixo Y2 (Reps) - Barras ocupam 40% da altura inferior
    const scaleYRepsHeight = d3.scaleLinear()
      .domain([0, maxReps * 1.5])
      .range([0, GRAPH_HEIGHT * 0.5]);

    // 3. Caminhos
    const volPoints = data.map((d, i) => ({ x: scaleX(i), y: scaleYVol(d.volume) + TOP_PADDING }));
    const linePath = Skia.Path.MakeFromSVGString(generateCurvedPath(volPoints))!;

    const areaGenerator = d3.area<any>()
      .x((_, i) => scaleX(i))
      .y0(CHART_HEIGHT - BOTTOM_PADDING)
      .y1(d => scaleYVol(d.volume) + TOP_PADDING)
      .curve(d3.curveCatmullRom.alpha(0.5));

    const areaPath = Skia.Path.MakeFromSVGString(areaGenerator(data) || "")!;

    // 4. Tendência (Slope)
    const trendVol = calculateTrendLine(volPoints.map((p, i) => ({ x: i, y: p.y })));
    let trendCoords = null;
    let trendLabel = "Estável";
    let trendColor = "#A0AEC0";

    if (trendVol) {
      const isPositive = trendVol.slopeValue < 0; // Y menor = mais alto visualmente
      trendCoords = {
        p1: vec(scaleX(0), trendVol.start.y),
        p2: vec(scaleX(data.length - 1), trendVol.end.y),
      };
      if (isPositive) { trendLabel = "Crescente 🚀"; trendColor = "#38A169"; }
      else { trendLabel = "Decrescente 🔻"; trendColor = "#E53E3E"; }
    }

    return {
      scales: { x: scaleX, yVol: scaleYVol, yRepsH: scaleYRepsHeight },
      paths: { line: linePath, area: areaPath },
      trends: { coords: trendCoords, label: trendLabel, color: trendColor },
      ticks: volTicks
    };
  }, [data, CANVAS_WIDTH]);

  return (
    <View style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.legendDot, { backgroundColor: colorVolume }]} />
              {/* [MUDANÇA] Texto da legenda atualizado */}
              <Text style={styles.legendText}>Vol. Médio (kg)</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.legendDot, { backgroundColor: colorReps }]} />
              <Text style={styles.legendText}>Reps</Text>
            </View>
          </View>
        </View>
        <View style={[styles.trendBadge, { borderColor: trends.color }]}>
          <Text style={[styles.trendLabel, { color: trends.color }]}>{trends.label}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', height: CHART_HEIGHT }}>

        {/* EIXO Y FIXO (Esquerda) */}
        <View style={styles.yAxisContainer}>
          {ticks.map((tick, i) => (
            <Text key={i} style={[styles.yAxisText, {
              position: 'absolute',
              top: scales.yVol(tick) + TOP_PADDING - 6
            }]}>
              {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
            </Text>
          ))}
        </View>

        {/* ÁREA DE SCROLL (Gráfico) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
          <View style={{ width: CANVAS_WIDTH, height: CHART_HEIGHT }}>
            <Canvas style={{ flex: 1 }}>

              {/* LINHAS DE GRADE (Grid) */}
              {ticks.map((tick, i) => (
                <Line
                  key={`grid-${i}`}
                  p1={vec(0, scales.yVol(tick) + TOP_PADDING)}
                  p2={vec(CANVAS_WIDTH, scales.yVol(tick) + TOP_PADDING)}
                  color="#F0F0F0"
                  strokeWidth={1}
                />
              ))}

              {/* 1. BARRAS DE REPS (Mais visíveis agora) */}
              {data.map((d, i) => {
                const barHeight = scales.yRepsH(d.avgReps);
                const x = scales.x(i) - 14; // Barra de 28px
                const y = CHART_HEIGHT - BOTTOM_PADDING - barHeight;

                return (
                  <Group key={`bar-${i}`}>
                    {/* Fundo da barra */}
                    <RoundedRect
                      x={x} y={y} width={28} height={barHeight}
                      color={colorReps} opacity={0.6} r={4} // Opacidade aumentada
                    />
                    {/* Topo da barra (destaque) */}
                    <RoundedRect
                      x={x} y={y} width={28} height={3}
                      color={colorReps} opacity={1} r={2}
                    />
                  </Group>
                );
              })}

              {/* 2. ÁREA DE VOLUME */}
              <Path path={paths.area}>
                <LinearGradient
                  start={vec(0, TOP_PADDING)}
                  end={vec(0, CHART_HEIGHT - BOTTOM_PADDING)}
                  colors={[colorVolume + '33', colorVolume + '00']}
                />
              </Path>

              {/* 3. TENDÊNCIA */}
              {trends.coords && (
                <Line
                  p1={trends.coords.p1}
                  p2={trends.coords.p2}
                  color={trends.color}
                  style="stroke"
                  strokeWidth={2}
                  opacity={0.6}
                >
                  <DashPathEffect intervals={[6, 6]} />
                </Line>
              )}

              {/* 4. LINHA PRINCIPAL */}
              <Path
                path={paths.line}
                style="stroke"
                strokeWidth={4}
                color={colorVolume}
                strokeCap="round"
                strokeJoin="round"
              />

              {/* 5. PONTOS */}
              {data.map((d, i) => (
                <Group key={`dot-${i}`}>
                  <Circle cx={scales.x(i)} cy={scales.yVol(d.volume) + TOP_PADDING} r={7} color="white" />
                  <Circle cx={scales.x(i)} cy={scales.yVol(d.volume) + TOP_PADDING} r={5} color={colorVolume} />
                </Group>
              ))}
            </Canvas>

            {/* RÓTULOS (Views Nativas para Nitidez) */}
            {data.map((d, i) => {
              const xPos = scales.x(i);
              const yPos = scales.yVol(d.volume) + TOP_PADDING;

              return (
                <React.Fragment key={`lbl-${i}`}>

                  {/* Badge de Volume (Acima) */}
                  <View style={[styles.valBadge, {
                    left: xPos - 25,
                    top: yPos - 30,
                    backgroundColor: colorVolume
                  }]}>
                    <Text style={styles.valText}>
                      {d.volume >= 1000 ? `${(d.volume / 1000).toFixed(1)}k` : Math.round(d.volume)}
                    </Text>
                  </View>

                  {/* Valor de Reps (Base da barra) */}
                  {d.avgReps > 0 && (
                    <Text style={[styles.repsText, {
                      left: xPos - 20,
                      bottom: BOTTOM_PADDING + 4,
                      color: '#2C5282' // Azul escuro para contraste
                    }]}>
                      {Math.round(d.avgReps)}r
                    </Text>
                  )}

                  {/* Data (Eixo X) */}
                  <Text style={[styles.dateText, {
                    left: xPos - 25,
                    bottom: 8
                  }]}>
                    {d.label}
                  </Text>

                </React.Fragment>
              )
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: '#EDF2F7',
    overflow: 'hidden'
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F7FAFC'
  },
  title: { fontSize: 16, fontWeight: '800', color: '#2D3748', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#A0AEC0' },

  trendBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, backgroundColor: '#FAFAFA'
  },
  trendLabel: { fontSize: 12, fontWeight: '800' },

  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { fontSize: 12, color: '#718096', fontWeight: '600' },

  // EIXOS
  yAxisContainer: {
    width: 40,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    zIndex: 10
  },
  yAxisText: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#A0AEC0'
  },

  // LABELS FLUTUANTES
  valBadge: {
    position: 'absolute',
    width: 50,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, elevation: 2
  },
  valText: {
    color: '#FFF', fontSize: 11, fontWeight: 'bold'
  },
  repsText: {
    position: 'absolute', width: 40, textAlign: 'center', fontSize: 11, fontWeight: '800'
  },
  dateText: {
    position: 'absolute', width: 50, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#4A5568'
  },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', height: 200 },
  emptyText: { marginTop: 12, color: '#A0AEC0', fontStyle: 'italic' },
});