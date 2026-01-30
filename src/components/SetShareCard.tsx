import { View, Text, StyleSheet, Dimensions, Image, LayoutChangeEvent } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HistoricalSet } from '@/types/workout';
import { calculateE1RM } from '@/utils/e1rm';

const { width } = Dimensions.get('window');

import { MusicTrackInfo } from '@/types/music';
import { MusicMarquee } from './MusicMarquee';
import {
  Canvas,
  RoundedRect,
  Rect,
  LinearGradient as SkiaLinearGradient,
  vec,
  Skia,
  Mask,
  BlurMask,
  Group
} from "@shopify/react-native-skia";

interface Props {
  exerciseName: string;
  set: HistoricalSet | null;
  previousSet: HistoricalSet | null;
  isPR: boolean;
  getDaysAgo: (date: string | Date) => string;
  bgOpacity: number;
  prKind?: 'e1rm' | 'reps' | 'none';
  music?: MusicTrackInfo | null;
  colors?: string[];
  textColor?: string;
  musicColor?: string;
  borderRadius?: number;
  feather?: number;
}

const DiffBadge = ({ diff, unit, isPositive }: any) => {
  if (diff === 0) return null;
  const color = isPositive ? '#38A169' : '#E53E3E';
  const sign = isPositive ? '+' : '';

  return (
    <View style={[styles.diffBadge, { backgroundColor: color }]}>
      <Text style={styles.diffText}>
        {sign}{diff.toFixed(0)} {unit}
      </Text>
    </View>
  );
};

const PerformanceColumn = ({ label, dateLabel, set, textColor = '#FFFFFF' }: any) => (
  <View style={styles.column}>
    <Text style={[styles.columnLabel, { color: textColor, opacity: 0.6 }]}>{label}</Text>
    <Text style={[styles.dateLabel, { color: textColor, opacity: 0.5 }]}>{dateLabel}</Text>

    <View style={styles.dataRow}>
      <Text style={[styles.dataValue, { color: textColor }]}>{set.weight.toFixed(1)}</Text>
      <Text style={[styles.dataUnit, { color: textColor }]}>kg</Text>
    </View>

    <Text style={[styles.repText, { color: textColor }]}>x {set.reps} reps</Text>

    <Text style={[styles.e1rmText, { color: textColor, opacity: 0.6 }]}>
      {calculateE1RM(set.weight, set.reps).toFixed(1)} e1RM
    </Text>
  </View>
);

export default function SetShareCard({
  exerciseName,
  set,
  previousSet,
  isPR,
  prKind = 'none',
  getDaysAgo,
  bgOpacity,
  music,
  colors = ['#232526', '#414345'],
  textColor = '#FFFFFF',
  musicColor = '#1DB954',
  borderRadius = 20,
  feather = 0,
}: Props) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  if (!set) return null;

  let repDiff = 0;
  let weightDiff = 0;

  if (previousSet) {
    repDiff = set.reps - previousSet.reps;
    weightDiff = set.weight - previousSet.weight;
  }

  return (
    <View onLayout={onLayout} style={[
      styles.wrapper,
      {
        borderRadius: feather > 0 ? 0 : borderRadius,
        overflow: feather > 0 ? 'visible' : 'hidden',
        backgroundColor: 'transparent'
      }
    ]}>
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
                  start={vec(0, 0)} end={vec(layout.width, layout.height / 2)}
                  colors={colors.map(c => Skia.Color(c))}
                />
              </Rect>
            </Mask>
          </Group>
        </Canvas>
      </View>

      <View style={{ opacity: 1 }}>
        <View style={styles.headerRow}>
          <View style={styles.header}>
            {isPR && <Feather name="award" size={24} color="#F6E05E" style={{ marginRight: 10 }} />}
            <View>
              <Text style={[styles.title, textColor !== '#FFFFFF' && { color: textColor }]}>
                {isPR ? 'NOVO RECORDE!' : 'SÉRIE CONCLUÍDA'}
              </Text>

              {prKind === 'e1rm' && (
                <Text style={[styles.prType, { color: textColor, opacity: 0.8 }]}>Recorde de peso / e1RM</Text>
              )}
              {prKind === 'reps' && (
                <Text style={[styles.prType, { color: textColor, opacity: 0.8 }]}>Recorde de repetições</Text>
              )}
            </View>
          </View>

          <Text style={[styles.exerciseName, { color: textColor }]}>{exerciseName}</Text>
        </View>

        <View style={styles.compareBox}>
          {previousSet ? (
            <>
              <PerformanceColumn
                label="ANTES"
                set={previousSet}
                dateLabel={getDaysAgo(previousSet.date)}
                textColor={textColor}
              />
              <View style={styles.separator} />
              <PerformanceColumn
                label="HOJE"
                set={set}
                dateLabel="hoje"
                textColor={textColor}
              />
            </>
          ) : (
            <PerformanceColumn label="HOJE" set={set} dateLabel="" textColor={textColor} />
          )}
        </View>

        {isPR && (
          <View style={styles.diffContainer}>
            <DiffBadge diff={weightDiff} unit="kg" isPositive={weightDiff > 0} />
            <DiffBadge diff={repDiff} unit="reps" isPositive={repDiff > 0} />
          </View>
        )}

        {music && (
          <View style={styles.musicContainer}>
            {music.albumArt ? (
              <Image source={{ uri: music.albumArt }} style={styles.albumArt} />
            ) : (
              <View style={[styles.albumArt, styles.albumPlaceholder]}>
                <Feather name="music" size={16} color="#FFF" />
              </View>
            )}
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <MusicMarquee
                text={`${music.track} • ${music.artist}`}
                style={[styles.musicText, { color: musicColor }]}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: width - 48,
    padding: 24,
  },
  background: { flex: 1 },
  headerRow: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#F6E05E', fontSize: 18, fontWeight: 'bold' },
  prType: { color: '#CBD5E0', fontSize: 12, marginTop: 2 },
  exerciseName: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 6 },
  compareBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    justifyContent: 'space-between',
  },
  separator: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },
  dataRow: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1 },
  columnLabel: { color: '#A0AEC0', fontSize: 12, fontWeight: '600' },
  dateLabel: { color: '#718096', fontSize: 11, marginBottom: 8 },
  dataValue: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  dataUnit: { color: '#FFF', fontSize: 16, marginLeft: 4 },
  repText: { color: '#FFF', fontSize: 16, marginTop: 4 },
  e1rmText: { color: '#A0AEC0', fontSize: 14, marginTop: 4 },
  diffContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  diffBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  diffText: { color: '#FFF', fontWeight: 'bold' },
  musicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    gap: 10
  },
  albumArt: {
    width: 40,
    height: 40,
    borderRadius: 4
  },
  albumPlaceholder: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center'
  },
  musicText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600'
  }
});