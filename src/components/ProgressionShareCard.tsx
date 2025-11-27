import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  VictoryChart, 
  VictoryLine, 
  VictoryArea, 
  VictoryAxis, 
  VictoryScatter,
  VictoryGroup 
} from 'victory-native';
import { Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

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
const cardWidth = SCREEN_WIDTH - 48;
const cardHeight = 180; // Um pouco mais alto para o gráfico respirar

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

  if (!hasProgression) {
    return (
      <View style={styles.wrapper}>
        <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
          <LinearGradient colors={['#232526', '#414345']} style={styles.background} />
        </View>
        <View style={[styles.card, { height: cardHeight }]}>
          <Text style={styles.title}>Trabalho de Hoje</Text>
          <View style={styles.row}>
            <View style={styles.infoContainerAlone}>
              <Text style={styles.exerciseName}>{exerciseName}</Text>
              <Text style={styles.series}>{`${set.weight} kg × ${set.reps}`}</Text>
              <Text style={styles.sessionVolume}>{formattedTEV}</Text>
              <Text style={styles.totalVolume}>Sem histórico suficiente para gráfico.</Text>
            </View>
          </View>
          <Text style={styles.footer}>Logbook da Escola de Força</Text>
        </View>
      </View>
    );
  }

  // --- PREPARAÇÃO DOS DADOS PARA O GRÁFICO "TIJOLO & PILHA" ---
  
  const nonNullProgression = progression!.filter(p => typeof p.value === 'number' && !Number.isNaN(p.value));
  
  // 1. Dados do histórico puro (Sem o dia de hoje)
  const historyData = nonNullProgression.map((p, i) => ({ x: i + 1, y: p.value }));
  
  // O último valor acumulado antes de hoje
  const lastHistoricalValue = historyData.length > 0 ? historyData[historyData.length - 1].y : 0;
  
  // O novo total com o treino de hoje
  const currentTotal = lastHistoricalValue + currentSessionTEV;
  const nextX = historyData.length + 1;

  // 2. Dataset Vermelho (Fundo): Histórico + Pulo para o novo total
  // Representa a "Pilha" completa atualizada
  const redData = [...historyData, { x: nextX, y: currentTotal }];

  // 3. Dataset Branco (Frente): Histórico + Linha reta mantendo o valor anterior
  // Isso cria o efeito de "base", onde a diferença pro vermelho é o "tijolo" novo
  const whiteData = [...historyData, { x: nextX, y: lastHistoricalValue }];

  const totalVolumeStr = currentTotal.toLocaleString('pt-BR');

  return (
    <View style={styles.wrapper}>
      <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
        <LinearGradient colors={['#232526', '#414345']} style={styles.background} />
      </View>

      <View style={[styles.card, { height: cardHeight }]}>
        <Text style={styles.title}>Trabalho de Hoje</Text>
        
        <View style={styles.row}>
          {/* GRÁFICO À ESQUERDA */}
          <View style={styles.chartContainer}>
            <VictoryChart 
              width={cardWidth * 0.65} 
              height={cardHeight * 0.85} 
              padding={{ top: 10, bottom: 25, left: 5, right: 20 }}
            >
               <Defs>
                {/* Gradiente para o gráfico branco (Baseline) */}
                <SvgLinearGradient id="whiteGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor="white" stopOpacity={0.4}/>
                  <Stop offset="100%" stopColor="white" stopOpacity={0.05}/>
                </SvgLinearGradient>
                
                {/* Gradiente para o gráfico vermelho (New Volume) */}
                <SvgLinearGradient id="redGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor="#F56565" stopOpacity={0.9}/>
                  <Stop offset="100%" stopColor="#F56565" stopOpacity={0.2}/>
                </SvgLinearGradient>
              </Defs>

              <VictoryAxis 
                style={{ 
                  axis: { stroke: "transparent" }, 
                  tickLabels: { fill: "transparent" }, 
                  grid: { stroke: "rgba(255,255,255,0.1)", strokeDasharray: "4, 4" } 
                }} 
              />

              <VictoryGroup>
                {/* CAMADA 1: TOTAL (VERMELHO) - Fica atrás */}
                <VictoryArea 
                  data={redData} 
                  interpolation="monotoneX" 
                  style={{ data: { fill: "url(#redGradient)", stroke: "#F56565", strokeWidth: 2 } }} 
                />
                
                {/* CAMADA 2: ANTERIOR (BRANCO) - Fica na frente, cobrindo a base do vermelho */}
                <VictoryArea 
                  data={whiteData} 
                  interpolation="monotoneX" 
                  style={{ data: { fill: "url(#whiteGradient)", stroke: "white", strokeWidth: 2 } }} 
                />
              </VictoryGroup>

              {/* Ponto de destaque no topo do vermelho (o novo total) */}
              <VictoryScatter 
                data={[{ x: nextX, y: currentTotal }]} 
                size={5} 
                style={{ data: { fill: "#F56565", stroke: "white", strokeWidth: 2 } }} 
              />
            </VictoryChart>
          </View>

          {/* INFORMAÇÕES À DIREITA */}
          <View style={styles.infoContainer}>
            <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>
            
            <View style={styles.divider} />
            
            <Text style={styles.label}>Série Atual</Text>
            <Text style={styles.series}>{`${set.weight}kg × ${set.reps}`}</Text>
            {set.side && <Text style={styles.seriesSide}>({set.side})</Text>}
            
            <View style={styles.volumeBox}>
               <Text style={styles.label}>Volume Adicionado</Text>
               <Text style={styles.sessionVolume}>{formattedTEV}</Text>
            </View>
            
            <Text style={styles.totalVolume}>{`Total Acumulado: ${totalVolumeStr} kg`}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Logbook da Escola de Força</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderRadius: 20, 
    width: cardWidth, 
    overflow: 'hidden' 
  },
  background: { flex: 1 },
  card: { 
    backgroundColor: 'transparent', 
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  title: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#A0AEC0', 
    textTransform: 'uppercase', 
    letterSpacing: 1,
    marginBottom: 4, 
    textAlign: 'left' 
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  chartContainer: { 
    width: '60%', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginLeft: -10 // Ajuste para compensar padding do Victory
  },
  infoContainer: { 
    width: '40%', 
    paddingLeft: 4, 
    justifyContent: 'center' 
  },
  infoContainerAlone: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  exerciseName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', marginBottom: 4, lineHeight: 18 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 6, width: '100%' },
  
  label: { fontSize: 10, color: '#A0AEC0', marginBottom: 1 },
  series: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  seriesSide: { fontSize: 12, color: '#E0E0E0', marginBottom: 4 },
  
  volumeBox: { marginTop: 8, marginBottom: 2 },
  sessionVolume: { fontSize: 16, fontWeight: '800', color: '#F56565' }, // Vermelho para destacar o ganho
  
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