import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { ChartDataPoint } from '@/types/analytics';
import { SCREEN_WIDTH } from '@gorhom/bottom-sheet';

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

const { width } = Dimensions.get('window');

const cardWidth = SCREEN_WIDTH - 48;
const cardHeight = 160;
const chartWidth = cardWidth * 0.55;
const chartHeight = 100;

const chartConfig = {
  backgroundGradientFromOpacity: 0,
  backgroundGradientToOpacity: 0,
  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.5})`,
  strokeWidth: 0,
  propsForDots: { r: '0' },
  withInnerLines: false,
  withOuterLines: false,
  withVerticalLabels: false,
  withHorizontalLabels: false,
  decimalPlaces: 0,
};

export default function ProgressionShareCard({
  exerciseName,
  set,
  progression,
  bgOpacity,
  currentSessionTEV,
}: Props) {
  if (!set) return null;

  const hasProgression = progression && progression.length > 0;

  // Se não há histórico suficiente
  if (!hasProgression) {
    const formattedTEV = `+${currentSessionTEV.toLocaleString('pt-BR')} kg`;

    const fallbackContent = (
      <View style={[styles.card, { height: cardHeight }]}>
        <Text style={styles.title}>Trabalho de Hoje</Text>

        <View style={styles.row}>
          <View style={styles.infoContainerAlone}>
            <Text style={styles.exerciseName}>{exerciseName}</Text>
            <Text style={styles.series}>{`${set.weight} kg × ${set.reps}`}</Text>
            {set.side && <Text style={styles.seriesSide}>({set.side})</Text>}
            <Text style={styles.sessionVolume}>{formattedTEV}</Text>
            <Text style={styles.totalVolume}>
              Sem histórico suficiente para mostrar a progressão.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>Logbook da Escola de Força</Text>
      </View>
    );

    return (
      <View style={styles.wrapper}>
        <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
          <LinearGradient
            colors={['#232526', '#414345']}
            style={styles.background}
          />
        </View>
        <View style={{ opacity: 1 }}>
          {fallbackContent}
        </View>
      </View>
    );
  }

  // ============================
  // Com histórico: gráfico
  // ============================
  const nonNullProgression = progression!.filter(
    p => typeof p.value === 'number' && !Number.isNaN(p.value)
  );

  if (!nonNullProgression.length) return null;

  const historicalValues = nonNullProgression.map(p => p.value);
  const lastHistoricalValue =
    historicalValues.length > 0 ? historicalValues[historicalValues.length - 1] : 0;

  // Linha branca = histórico + sessão
  const whiteLine = [
    ...historicalValues,
    lastHistoricalValue + currentSessionTEV,
  ];

  // Linha vermelha = só a sessão de hoje (como incremento)
  const redLine = whiteLine.map((val, idx) => {
    if (idx < whiteLine.length - 1) return val;
    return lastHistoricalValue + currentSessionTEV;
  });

  const maxWhite = Math.max(...whiteLine, 1);
  const data = {
    labels: whiteLine.map((_, i) => String(i + 1)),
    datasets: [
      {
        data: whiteLine.map(v => (v / maxWhite) * 100),
        color: () => `rgba(255,255,255,0.3)`,
        strokeWidth: 1.2,
        withDots: false,
      },
      {
        data: redLine.map(v => (v / maxWhite) * 100),
        color: () => `rgba(255,59,48,0.8)`,
        strokeWidth: 2,
        withDots: false,
      },
    ],
  };

  const formattedTEV = `+${currentSessionTEV.toLocaleString('pt-BR')} kg`;
  const totalVolume = (
    lastHistoricalValue + currentSessionTEV
  ).toLocaleString('pt-BR');

  const cardContent = (
    <View style={[styles.card, { height: cardHeight }]}>
      <Text style={styles.title}>Trabalho de Hoje</Text>

      <View style={styles.row}>
        {/* Gráfico à esquerda */}
        <View style={styles.chartContainer}>
          <LineChart
            data={data}
            width={chartWidth}
            height={chartHeight}
            chartConfig={chartConfig}
            bezier
            withDots={false}
            withInnerLines={false}
            withVerticalLabels={false}
            withHorizontalLabels={false}
            withOuterLines={false}
            renderDotContent={() => null}
            segments={4}
            getDotProps={() => ({ r: '0' })}
            decorator={() => null}
            formatYLabel={() => ''}
            formatXLabel={() => ''}
            style={{ paddingRight: 0, marginLeft: -20 }}
          />
        </View>

        {/* Informações à direita */}
        <View style={styles.infoContainer}>
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.series}>{`${set.weight} kg × ${set.reps}`}</Text>
          {set.side && <Text style={styles.seriesSide}>({set.side})</Text>}
          <Text style={styles.sessionVolume}>{formattedTEV}</Text>
          <Text style={styles.totalVolume}>{`Total: ${totalVolume} kg`}</Text>
        </View>
      </View>

      <Text style={styles.footer}>Logbook da Escola de Força</Text>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <View style={{ opacity: bgOpacity, ...StyleSheet.absoluteFillObject }}>
        <LinearGradient
          colors={['#232526', '#414345']}
          style={styles.background}
        />
      </View>
      <View style={{ opacity: 1 }}>
        {cardContent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    width: cardWidth,
    overflow: 'hidden',
  },
  background: {
    flex: 1,
  },
  gradientContainer: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    width: cardWidth,
  },
  transparentContainer: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: cardWidth,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartContainer: {
    width: chartWidth,
    height: chartHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  infoContainerAlone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  series: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  seriesSide: {
    fontSize: 12,
    color: '#E0E0E0',
    marginBottom: 4,
  },
  sessionVolume: {
    fontSize: 12,
    fontWeight: '500',
    color: '#90CDF4',
    marginTop: 4,
  },
  totalVolume: {
    fontSize: 12,
    color: '#E0E0E0',
    marginTop: 2,
  },
  footer: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.6,
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
    width: '100%',
  },
});
