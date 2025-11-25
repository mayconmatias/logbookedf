import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  VictoryChart, 
  VictoryLine, 
  VictoryArea, 
  VictoryAxis, 
  VictoryScatter, 
  VictoryTheme 
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
const cardHeight = 160;

export default function ProgressionShareCard({
  exerciseName,
  set,
  progression,
  bgOpacity,
  currentSessionTEV,
}: Props) {
  if (!set) return null;

  const hasProgression = progression && progression.length > 0;

  if (!hasProgression) {
    const formattedTEV = `+${currentSessionTEV.toLocaleString('pt-BR')} kg`;
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
              {set.side && <Text style={styles.seriesSide}>({set.side})</Text>}
              <Text style={styles.sessionVolume}>{formattedTEV}</Text>
              <Text style={styles.totalVolume}>Sem histórico suficiente para mostrar a progressão.</Text>
            </View>
          </View>
          <Text style={styles.footer}>Logbook da Escola de Força</Text>
        </View>
      </View>
    );
  }

  const nonNullProgression = progression!.filter(p => typeof p.value === 'number' && !Number.isNaN(p.value));
  const historicalValues = nonNullProgression.map(p => p.value);
  const lastHistoricalValue = historicalValues.length > 0 ? historicalValues[historicalValues.length - 1] : 0;
  const currentTotal = lastHistoricalValue + currentSessionTEV;

  const chartData = nonNullProgression.map((p, i) => ({ x: i + 1, y: p.value }));
  chartData.push({ x: chartData.length + 1, y: currentTotal });

  const formattedTEV = `+${currentSessionTEV.toLocaleString('pt-BR')} kg`;
  const totalVolumeStr = currentTotal.toLocaleString('pt-BR');

  return (
    <View style={styles.wrapper}>
      <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
        <LinearGradient colors={['#232526', '#414345']} style={styles.background} />
      </View>

      <View style={[styles.card, { height: cardHeight }]}>
        <Text style={styles.title}>Trabalho de Hoje</Text>
        <View style={styles.row}>
          <View style={styles.chartContainer}>
            <VictoryChart 
              width={cardWidth * 0.6} 
              height={cardHeight * 0.8} 
              padding={{ top: 10, bottom: 30, left: 30, right: 20 }}
              theme={VictoryTheme.material}
            >
              <Defs>
                <SvgLinearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor="white" stopOpacity={0.4}/>
                  <Stop offset="100%" stopColor="white" stopOpacity={0}/>
                </SvgLinearGradient>
              </Defs>
              <VictoryAxis style={{ axis: { stroke: "transparent" }, tickLabels: { fill: "transparent" }, grid: { stroke: "rgba(255,255,255,0.1)" } }} />
              <VictoryArea data={chartData} interpolation="monotoneX" style={{ data: { fill: "url(#chartGradient)" } }} />
              <VictoryLine data={chartData} interpolation="monotoneX" style={{ data: { stroke: "white", strokeWidth: 2 } }} />
              <VictoryScatter data={[chartData[chartData.length - 1]]} size={5} style={{ data: { fill: "#F56565" } }} />
            </VictoryChart>
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.exerciseName}>{exerciseName}</Text>
            <Text style={styles.series}>{`${set.weight} kg × ${set.reps}`}</Text>
            {set.side && <Text style={styles.seriesSide}>({set.side})</Text>}
            <Text style={styles.sessionVolume}>{formattedTEV}</Text>
            <Text style={styles.totalVolume}>{`Total: ${totalVolumeStr} kg`}</Text>
          </View>
        </View>

        <Text style={styles.footer}>Logbook da Escola de Força</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16, width: cardWidth, overflow: 'hidden' },
  background: { flex: 1 },
  card: { backgroundColor: 'transparent', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 4, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  chartContainer: { width: '55%', justifyContent: 'center', alignItems: 'center' },
  infoContainer: { width: '45%', paddingLeft: 8, justifyContent: 'center' },
  infoContainerAlone: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  exerciseName: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  series: { fontSize: 13, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  seriesSide: { fontSize: 12, color: '#E0E0E0', marginBottom: 4 },
  sessionVolume: { fontSize: 12, fontWeight: '500', color: '#90CDF4', marginTop: 4 },
  totalVolume: { fontSize: 12, color: '#E0E0E0', marginTop: 2 },
  footer: { fontSize: 10, fontWeight: '500', color: '#FFFFFF', textAlign: 'center', opacity: 0.6, paddingTop: 4, borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', width: '100%' },
});