import { View, Text, StyleSheet, Dimensions, LayoutChangeEvent } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Canvas,
  Path,
  LinearGradient as SkiaLinearGradient,
  vec,
  Skia,
  Circle,
  Group,
  Mask,
  RoundedRect,
  Rect,
  BlurMask
} from "@shopify/react-native-skia";
import * as d3 from "d3";

import { ChartDataPoint } from '@/types/analytics';
import { MusicTrackInfo } from '@/types/music';

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
  colors?: string[];
  music?: MusicTrackInfo | null;
  textColor?: string;
  musicColor?: string;
  borderRadius?: number;
  feather?: number;
};

import { useMemo } from 'react';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = 200;

// Dimensões fixas para o Skia
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
  colors = ['#232526', '#414345'],
  music,
  textColor = '#FFFFFF',
  musicColor = '#1DB954',
  borderRadius = 20,
  feather = 0
}: Props) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  if (!set) return null;

  const hasProgression = progression && progression.length > 0;
  const formattedTEV = `+${currentSessionTEV.toLocaleString('pt-BR')} kg`;

  // --- Caso SEM progressão (Card simples) ---
  if (!hasProgression) {
    return (
      <View
        onLayout={onLayout}
        style={[
          styles.wrapper,
          {
            width: CARD_WIDTH,
            borderRadius: feather > 0 ? 0 : borderRadius,
            overflow: feather > 0 ? 'visible' : 'hidden',
            backgroundColor: 'transparent'
          }
        ]}
      >
        <View style={StyleSheet.absoluteFillObject}>
          <Canvas style={{ flex: 1 }}>
            <Group opacity={bgOpacity}>
              <Mask
                mask={
                  <RoundedRect
                    x={feather}
                    y={feather}
                    width={layout.width - 2 * feather}
                    height={layout.height - 2 * feather}
                    r={Math.max(0, borderRadius - feather)}
                    color="black"
                  >
                    <BlurMask blur={feather} style="normal" />
                  </RoundedRect>
                }
              >
                <Rect x={0} y={0} width={layout.width} height={layout.height}>
                  <SkiaLinearGradient
                    start={vec(0, 0)} end={vec(layout.width, layout.height)}
                    colors={colors.map(c => Skia.Color(c))}
                  />
                </Rect>
              </Mask>
            </Group>
          </Canvas>
        </View>
        <View style={[styles.card, { height: CARD_HEIGHT, opacity: 1 }]}>
          <Text style={styles.title}>Trabalho de Hoje</Text>
          <View style={styles.row}>
            <View style={styles.infoContainerAlone}>
              <Text style={[styles.exerciseName, { color: textColor }]}>{exerciseName}</Text>
              <Text style={[styles.series, { color: textColor }]}>{`${set.weight} kg × ${set.reps}`}</Text>
              <Text style={styles.sessionVolume}>{formattedTEV}</Text>
              <Text style={[styles.totalVolume, { color: textColor }]}>Primeiro registro de volume.</Text>

              {music && (
                <View style={styles.musicContainer}>
                  <Feather name="music" size={10} color={musicColor} style={{ marginRight: 4 }} />
                  <Text style={[styles.musicText, { color: musicColor }]} numberOfLines={1}>{music.track} • {music.artist}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={[styles.footer, { color: textColor }]}>Logbook da Escola de Força</Text>
        </View>
      </View>
    );
  }

  // --- CÁLCULOS DO GRÁFICO (Com progressão) ---
  const { paths, lastPoint } = useMemo(() => {
    const cleanData = progression
      .filter(p => typeof p.value === 'number' && !isNaN(p.value) && p.value > 0)
      .map((p, i) => ({ x: i + 1, y: p.value }));

    if (cleanData.length === 0) return { paths: null, lastPoint: null };

    const historyData = cleanData.length === 1
      ? [{ x: 1, y: cleanData[0].y }, { x: 2, y: cleanData[0].y }]
      : cleanData;

    const lastHistoricalValue = historyData[historyData.length - 1].y;
    const currentTotal = lastHistoricalValue + currentSessionTEV;
    const nextX = historyData.length + 1;

    const redData = [...historyData, { x: nextX, y: currentTotal }];
    const whiteData = [...historyData, { x: nextX, y: lastHistoricalValue }];

    const xMax = nextX;
    const yMax = currentTotal * 1.2;

    const xScale = d3.scaleLinear().domain([1, xMax]).range([10, CHART_WIDTH - 10]);
    const yScale = d3.scaleLinear().domain([0, yMax]).range([CHART_HEIGHT - PADDING_BOTTOM, PADDING_TOP]);

    const areaGen = d3.area<{ x: number, y: number }>()
      .x(d => xScale(d.x))
      .y0(CHART_HEIGHT - PADDING_BOTTOM)
      .y1(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

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

  const totalVolumeStr = (progression[progression.length - 1].value + currentSessionTEV).toLocaleString('pt-BR');

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.wrapper,
        {
          width: CARD_WIDTH,
          borderRadius: feather > 0 ? 0 : borderRadius,
          overflow: feather > 0 ? 'visible' : 'hidden',
          backgroundColor: 'transparent'
        }
      ]}
    >
      <View style={StyleSheet.absoluteFillObject}>
        <Canvas style={{ flex: 1 }}>
          <Group opacity={bgOpacity}>
            <Mask
              mask={
                <RoundedRect
                  x={feather}
                  y={feather}
                  width={layout.width - 2 * feather}
                  height={layout.height - 2 * feather}
                  r={Math.max(0, borderRadius - feather)}
                  color="black"
                >
                  <BlurMask blur={feather} style="normal" />
                </RoundedRect>
              }
            >
              <Rect x={0} y={0} width={layout.width} height={layout.height}>
                <SkiaLinearGradient
                  start={vec(0, 0)} end={vec(layout.width, layout.height)}
                  colors={colors.map(c => Skia.Color(c))}
                />
              </Rect>
            </Mask>
          </Group>
        </Canvas>
      </View>

      <View style={[styles.card, { height: CARD_HEIGHT }]}>
        <Text style={styles.title}>Trabalho de Hoje</Text>

        <View style={styles.row}>
          {/* GRÁFICO */}
          <View style={{ width: CHART_WIDTH, height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
            {paths && paths.red && paths.white && lastPoint ? (
              <Canvas style={{ width: CHART_WIDTH, height: CHART_HEIGHT }}>
                <Group>
                  <Path path={paths.red} color="#F56565" style="fill">
                    <SkiaLinearGradient
                      start={vec(0, 0)} end={vec(0, CHART_HEIGHT)}
                      colors={["#F56565", "rgba(245, 101, 101, 0.3)"]}
                    />
                  </Path>
                  <Path path={paths.white} color="rgba(255,255,255,0.3)" style="fill">
                    <SkiaLinearGradient
                      start={vec(0, 0)} end={vec(0, CHART_HEIGHT)}
                      colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0.1)"]}
                    />
                  </Path>
                  <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} color={textColor === '#000000' ? '#666' : '#FFF'} />
                  <Circle cx={lastPoint.x} cy={lastPoint.y} r={3} color="#F56565" />
                </Group>
              </Canvas>
            ) : (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Gráfico indisponível</Text>
            )}
          </View>

          {/* INFORMAÇÕES */}
          <View style={styles.infoContainer}>
            <Text style={[styles.exerciseName, { color: textColor }]} numberOfLines={3} adjustsFontSizeToFit>{exerciseName}</Text>

            <View style={[styles.divider, { backgroundColor: textColor, opacity: 0.2 }]} />

            <Text style={[styles.label, { color: textColor, opacity: 0.6 }]}>Série Atual</Text>
            <Text style={[styles.series, { color: textColor }]}>{`${set.weight}kg × ${set.reps}`}</Text>
            {set.side && <Text style={[styles.seriesSide, { color: textColor, opacity: 0.8 }]}>({set.side})</Text>}

            <View style={styles.volumeBox}>
              <Text style={[styles.label, { color: textColor, opacity: 0.6 }]}>Volume Adicionado</Text>
              <Text style={styles.sessionVolume}>{formattedTEV}</Text>
            </View>

            <Text style={[styles.totalVolume, { color: textColor, opacity: 0.8 }]}>{`Total: ${totalVolumeStr} kg`}</Text>

            {music && (
              <View style={[styles.musicContainer, { marginTop: 6 }]}>
                <Feather name="music" size={8} color={musicColor} style={{ marginRight: 4 }} />
                <Text style={[styles.musicText, { color: musicColor }]}>{music.track}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.footer, { color: textColor, opacity: 0.5 }]}>Logbook da Escola de Força</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 12,
    paddingHorizontal: 16,
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
  musicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    opacity: 0.8
  },
  musicText: {
    fontSize: 8,
    color: '#CBD5E0'
  }
});