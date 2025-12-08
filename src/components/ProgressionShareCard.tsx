import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Canvas, 
  Path, 
  LinearGradient as SkiaLinearGradient, 
  vec, 
  Skia,
  Circle,
  Group
} from "@shopify/react-native-skia";
import * as d3 from "d3";

import { ChartDataPoint } from '@/types/analytics';

type SetData = {
  weight: number;
  reps: number;
  side?: string | null;
};

type Props = {
  exerciseName: string;
  set: SetData | null;
  progression: ChartDataPoint[] | null;
  bgOpacity: number;
  currentSessionTEV: number;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48; 
const CARD_HEIGHT = 200; // Um pouco mais alto para garantir espaço

// Dimensões fixas para o Skia (Crucial para evitar bugs no iOS)
const CHART_WIDTH = CARD_WIDTH * 0.65;
const CHART_HEIGHT = CARD_HEIGHT - 40; 
const PADDING_TOP = 20;
const PADDING_BOTTOM = 10;

export default function ProgressionShareCard({
  exerciseName,
  set,
  progression,
  bgOpacity,
  currentSessionTEV,
}: Props) {
  if (!set) return null;

  const hasProgression = progression && progression.length > 0;
  const formattedTEV = `+${currentSessionTEV.toLocaleString('pt-BR')} kg`;

  // Se não tiver histórico, exibe cartão simples
  if (!hasProgression) {
    return (
      <View style={[styles.wrapper, { width: CARD_WIDTH }]}>
        <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
          <LinearGradient colors={['#232526', '#414345']} style={styles.background} />
        </View>
        <View style={[styles.card, { height: CARD_HEIGHT }]}>
          <Text style={styles.title}>Trabalho de Hoje</Text>
          <View style={styles.row}>
            <View style={styles.infoContainerAlone}>
              <Text style={styles.exerciseName}>{exerciseName}</Text>
              <Text style={styles.series}>{`${set.weight} kg × ${set.reps}`}</Text>
              <Text style={styles.sessionVolume}>{formattedTEV}</Text>
              <Text style={styles.totalVolume}>Primeiro registro de volume.</Text>
            </View>
          </View>
          <Text style={styles.footer}>Logbook da Escola de Força</Text>
        </View>
      </View>
    );
  }

  // --- CÁLCULOS DO GRÁFICO ---
  const { paths, lastPoint } = useMemo(() => {
    // 1. Limpeza e Validação dos Dados
    const cleanData = progression
      .filter(p => typeof p.value === 'number' && !isNaN(p.value) && p.value > 0)
      .map((p, i) => ({ x: i + 1, y: p.value }));

    // Se a limpeza resultou em vazio, retorna null (vai renderizar sem gráfico)
    if (cleanData.length === 0) return { paths: null, lastPoint: null };

    // 2. Garante pelo menos 2 pontos para formar uma linha
    // Se tiver só 1, duplicamos o ponto para criar uma linha reta
    const historyData = cleanData.length === 1 
      ? [{ x: 1, y: cleanData[0].y }, { x: 2, y: cleanData[0].y }] 
      : cleanData;

    const lastHistoricalValue = historyData[historyData.length - 1].y;
    const currentTotal = lastHistoricalValue + currentSessionTEV;
    const nextX = historyData.length + 1;

    // Dataset Vermelho (Evolução Total)
    const redData = [...historyData, { x: nextX, y: currentTotal }];
    
    // Dataset Branco (Base Anterior)
    const whiteData = [...historyData, { x: nextX, y: lastHistoricalValue }];

    // 3. Escalas D3
    const xMax = nextX;
    const yMax = currentTotal * 1.2; // 20% de respiro no topo

    const xScale = d3.scaleLinear()
      .domain([1, xMax])
      .range([10, CHART_WIDTH - 10]);

    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([CHART_HEIGHT - PADDING_BOTTOM, PADDING_TOP]);

    // 4. Geradores de Área
    // curveMonotoneX suaviza a linha
    const areaGen = d3.area<{x: number, y: number}>()
      .x(d => xScale(d.x))
      .y0(CHART_HEIGHT - PADDING_BOTTOM)
      .y1(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    // Converte SVG Path String para Skia Path
    const redSVG = areaGen(redData);
    const whiteSVG = areaGen(whiteData);

    if (!redSVG || !whiteSVG) return { paths: null, lastPoint: null };

    return {
      paths: {
        red: Skia.Path.MakeFromSVGString(redSVG),
        white: Skia.Path.MakeFromSVGString(whiteSVG)
      },
      lastPoint: {
        x: xScale(nextX),
        y: yScale(currentTotal)
      }
    };
  }, [progression, currentSessionTEV]);

  const totalVolumeStr = (progression[progression.length-1].value + currentSessionTEV).toLocaleString('pt-BR');

  return (
    <View style={[styles.wrapper, { width: CARD_WIDTH }]}>
      <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
        <LinearGradient colors={['#232526', '#414345']} style={styles.background} />
      </View>

      <View style={[styles.card, { height: CARD_HEIGHT }]}>
        <Text style={styles.title}>Trabalho de Hoje</Text>
        
        <View style={styles.row}>
          {/* GRÁFICO */}
          <View style={{ width: CHART_WIDTH, height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
            {paths && paths.red && paths.white && lastPoint ? (
              <Canvas style={{ width: CHART_WIDTH, height: CHART_HEIGHT }}>
                 <Group>
                   {/* Fundo Vermelho (Novo PR) */}
                   <Path path={paths.red} color="#F56565" style="fill">
                     <SkiaLinearGradient
                        start={vec(0, 0)} end={vec(0, CHART_HEIGHT)}
                        colors={["#F56565", "rgba(245, 101, 101, 0.3)"]}
                      />
                   </Path>
                   
                   {/* Frente Branca (Base Anterior) */}
                   <Path path={paths.white} color="rgba(255,255,255,0.3)" style="fill">
                      <SkiaLinearGradient
                        start={vec(0, 0)} end={vec(0, CHART_HEIGHT)}
                        colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0.1)"]}
                      />
                   </Path>

                   {/* Ponto de Destaque (Topo) */}
                   <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} color="#FFF" />
                   <Circle cx={lastPoint.x} cy={lastPoint.y} r={3} color="#F56565" />
                 </Group>
              </Canvas>
            ) : (
              <Text style={{color: 'rgba(255,255,255,0.3)', fontSize: 10}}>Gráfico indisponível</Text>
            )}
          </View>

          {/* INFORMAÇÕES */}
          <View style={styles.infoContainer}>
            <Text style={styles.exerciseName} numberOfLines={3} adjustsFontSizeToFit>{exerciseName}</Text>
            
            <View style={styles.divider} />
            
            <Text style={styles.label}>Série Atual</Text>
            <Text style={styles.series}>{`${set.weight}kg × ${set.reps}`}</Text>
            {set.side && <Text style={styles.seriesSide}>({set.side})</Text>}
            
            <View style={styles.volumeBox}>
               <Text style={styles.label}>Volume Adicionado</Text>
               <Text style={styles.sessionVolume}>{formattedTEV}</Text>
            </View>
            
            <Text style={styles.totalVolume}>{`Total: ${totalVolumeStr} kg`}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Logbook da Escola de Força</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 20, 
    overflow: 'hidden',
    backgroundColor: '#000' // Fallback
  },
  background: { flex: 1 },
  card: { 
    backgroundColor: 'transparent', 
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  title: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: '#A0AEC0', 
    textTransform: 'uppercase', 
    letterSpacing: 1,
    marginBottom: 8, 
    textAlign: 'left' 
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  infoContainer: { 
    flex: 1,
    paddingLeft: 12, 
    justifyContent: 'center' 
  },
  infoContainerAlone: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  exerciseName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 6, lineHeight: 22 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 8, width: '100%' },
  
  label: { fontSize: 10, color: '#A0AEC0', marginBottom: 1 },
  series: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  seriesSide: { fontSize: 12, color: '#E0E0E0', marginBottom: 4 },
  
  volumeBox: { marginTop: 8, marginBottom: 2 },
  sessionVolume: { fontSize: 20, fontWeight: '800', color: '#F56565' }, 
  
  totalVolume: { fontSize: 10, color: '#E0E0E0', marginTop: 6, opacity: 0.8 },
  
  footer: { 
    fontSize: 10, 
    fontWeight: '500', 
    color: '#FFFFFF', 
    textAlign: 'center', 
    opacity: 0.5, 
    marginTop: 4, 
    width: '100%' 
  },
});