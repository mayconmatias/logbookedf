import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Path, Circle, Line, vec, Skia } from "@shopify/react-native-skia";
import * as d3 from "d3";
import moment from 'moment';

import { supabase } from '@/lib/supabaseClient';
import { ExerciseAnalyticsDataV2 } from '@/types/analytics';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRAPH_HEIGHT = 200;
const CARD_WIDTH = SCREEN_WIDTH * 0.44;

export type ExerciseAnalyticsSheetRef = {
  openSheet: (defId: string, name: string, studentId?: string) => void;
  close: () => void;
};

// --- SUB-COMPONENTES ---

const StatusCard = ({ status }: { status: string }) => {
  let color = '#718096';
  let bg = ['#EDF2F7', '#E2E8F0'];
  let icon: any = 'help-circle';
  let title = 'Analisando...';
  let desc = 'Dados insuficientes.';

  if (status === 'progressing') {
    color = '#2F855A';
    bg = ['#F0FFF4', '#C6F6D5'];
    icon = 'trending-up';
    title = 'Evoluindo! 🚀';
    desc = 'Carga e repetições subindo consistentemente.';
  } else if (status === 'stagnated') {
    color = '#D69E2E';
    bg = ['#FFFFF0', '#FEFCBF'];
    icon = 'minus';
    title = 'Estável ⚓';
    desc = 'Manutenção de carga. Tente variar o estímulo.';
  } else if (status === 'regressing') {
    color = '#C53030';
    bg = ['#FFF5F5', '#FED7D7'];
    icon = 'trending-down';
    title = 'Atenção 📉';
    desc = 'Volume caindo. Verifique sua recuperação.';
  }

  return (
    <LinearGradient colors={bg as any} style={[styles.statusCard, { borderColor: color }]}>
      <View style={styles.cardIconRow}>
        <Feather name={icon} size={24} color={color} />
        <Text style={[styles.cardTag, { color }]}>STATUS ATUAL</Text>
      </View>
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
      <Text style={[styles.cardDesc, { color }]}>{desc}</Text>
    </LinearGradient>
  );
};

const ProgressionCard = ({ data }: { data: ExerciseAnalyticsDataV2['last_progression'] }) => {
  if (!data || !data.date) {
    return (
      <View style={[styles.statusCard, { backgroundColor: '#F7FAFC', borderColor: '#E2E8F0' }]}>
        <Feather name="clock" size={24} color="#A0AEC0" />
        <Text style={[styles.cardTitle, { color: '#718096', marginTop: 8 }]}>Sem dados</Text>
        <Text style={styles.cardDesc}>Ainda não detectamos um padrão de progressão claro.</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#EBF8FF', '#BEE3F8']} style={[styles.statusCard, { borderColor: '#3182CE' }]}>
      <View style={styles.cardIconRow}>
        <Feather name="award" size={24} color="#3182CE" />
        <Text style={[styles.cardTag, { color: '#2B6CB0' }]}>ÚLTIMO PR</Text>
      </View>
      <Text style={[styles.cardTitle, { color: '#2C5282' }]}>
        {data.days_ago === 0 ? 'Hoje!' : `Há ${data.days_ago} dias`}
      </Text>
      <Text style={[styles.cardDesc, { color: '#2C5282' }]}>
        Você superou sua marca anterior em {moment(data.date).format('DD/MM')}.
      </Text>
    </LinearGradient>
  );
};

const InfoRow = ({ icon, label, value }: any) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIconBox}>
      <Feather name={icon} size={18} color="#4A5568" />
    </View>
    <View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const LastSessionRecap = ({ sets }: { sets: ExerciseAnalyticsDataV2['last_session_sets'] }) => {
  if (!sets || sets.length === 0) return null;

  return (
    <View style={styles.lastSessionContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Feather name="rotate-ccw" size={16} color="#718096" />
        <Text style={styles.sectionTitle}>Sessão Anterior</Text>
      </View>
      {sets.map((set, i: number) => (
        <View key={i} style={styles.setRow}>
          <View style={styles.setBadge}><Text style={styles.setIndexText}>#{set.set_number}</Text></View>
          <Text style={styles.setMainText}>{set.weight}kg <Text style={{ color: '#CBD5E0' }}>x</Text> {set.reps}</Text>
          {set.rpe && <View style={styles.rpeBadge}><Text style={styles.rpeText}>@{set.rpe}</Text></View>}
        </View>
      ))}
    </View>
  );
};

// GRÁFICO GENÉRICO DE LINHA
const SimpleLineChart = ({ data, color, yKey }: { data: any[], color: string, yKey: string }) => {
  if (!data || data.length < 2) return <Text style={styles.errorText}>Dados insuficientes para gráfico.</Text>;

  const ITEM_WIDTH = 60;
  const width = Math.max(SCREEN_WIDTH - 40, data.length * ITEM_WIDTH);
  const height = GRAPH_HEIGHT;
  const padding = 20;

  const values = data.map(d => d[yKey]);
  const yMax = Math.max(...values) * 1.1;
  const yMin = Math.min(...values) * 0.9;

  const xScale = d3.scaleLinear().domain([0, data.length - 1]).range([padding, width - padding]);
  const yScale = d3.scaleLinear().domain([yMin, yMax]).range([height - padding, padding]);

  const line = d3.line<any>().x((_, i) => xScale(i)).y(d => yScale(d[yKey])).curve(d3.curveMonotoneX)(data);
  const path = Skia.Path.MakeFromSVGString(line || "")!;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width, height }}>
        <Canvas style={{ flex: 1 }}>
          <Path path={path} color={color} style="stroke" strokeWidth={3} strokeCap="round" />
          {data.map((d, i) => (
            <React.Fragment key={i}>
              <Circle cx={xScale(i)} cy={yScale(d[yKey])} r={4} color={color} />
            </React.Fragment>
          ))}
        </Canvas>
        {data.map((d, i) => (
          <View key={i} style={{ position: 'absolute', left: xScale(i) - 20, top: yScale(d[yKey]) - 25, width: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#2D3748' }}>{Math.round(d[yKey])}</Text>
            <Text style={{ fontSize: 9, color: '#A0AEC0', marginTop: height - yScale(d[yKey]) + 25 }}>{moment(d.date).format('DD/MM')}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

export const ExerciseAnalyticsSheet = forwardRef<ExerciseAnalyticsSheetRef, {}>((props, ref) => {
  const sheetRef = useRef<TrueSheet>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExerciseAnalyticsDataV2 | null>(null);
  const [title, setTitle] = useState('');

  const loadData = async (defId: string, studentId?: string) => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_exercise_analytics_v2', {
        p_definition_id: defId,
        p_target_user_id: studentId || null
      });
      if (error) throw error;
      setData(res as ExerciseAnalyticsDataV2);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openSheet: (defId, name, studentId) => {
      setTitle(name);
      sheetRef.current?.present(0);
      loadData(defId, studentId);
    },
    close: () => sheetRef.current?.dismiss(),
  }));

  const renderContent = () => {
    if (loading) return <ActivityIndicator style={{ marginTop: 50 }} size="large" color="#007AFF" />;
    if (!data) return <Text style={styles.errorText}>Não foi possível carregar os dados.</Text>;

    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* 1. PROGRESSÃO & STATUS */}
        <View style={styles.cardsRow}>
          <ProgressionCard data={data.last_progression} />
          <StatusCard status={data.current_status} />
        </View>

        {/* 2. RECAP SESSÃO ANTERIOR (RESTAURADO) */}
        {data.last_session_sets && data.last_session_sets.length > 0 && (
          <LastSessionRecap sets={data.last_session_sets} />
        )}

        {/* 3. ESTATÍSTICAS TÉCNICAS */}
        <View style={styles.statsGrid}>
          <InfoRow
            icon="clock"
            label="Duração Média"
            value={data.avg_duration_min > 0 ? `${data.avg_duration_min} min` : '--'}
          />
          <InfoRow
            icon="watch"
            label="Descanso Médio"
            value={data.avg_rest_sec > 0 ? `${data.avg_rest_sec} seg` : '--'}
          />
          {data.favorite_set_type && (
            <InfoRow
              icon="layers"
              label="Tipo Favorito"
              value={data.favorite_set_type === 'normal' ? 'Séries Normais' : data.favorite_set_type.toUpperCase()}
            />
          )}
        </View>

        {/* 4. GRÁFICO FORÇA (AZUL) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Força (e1RM)</Text>
          <Text style={styles.sectionSub}>Estimativa de 1 Repetição Máxima.</Text>
          <View style={styles.chartContainer}>
            <SimpleLineChart data={data.chart_e1rm} color="#3182CE" yKey="avg" />
          </View>
        </View>

        {/* 5. GRÁFICO VOLUME (ROXO - AGORA LIBERADO) */}
        {data.chart_volume.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Volume de Carga</Text>
            <Text style={styles.sectionSub}>Peso Total x Repetições (kg).</Text>
            <View style={styles.chartContainer}>
              <SimpleLineChart data={data.chart_volume} color="#805AD5" yKey="vol_load" />
            </View>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  };

  return (
    <TrueSheet ref={sheetRef} sizes={['large']} cornerRadius={24} backgroundColor="#FFF">
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity onPress={() => sheetRef.current?.dismiss()}>
          <Feather name="x" size={24} color="#A0AEC0" />
        </TouchableOpacity>
      </View>
      {renderContent()}
    </TrueSheet>
  );
});

const styles = StyleSheet.create({
  content: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A202C', flex: 1 },
  errorText: { textAlign: 'center', marginTop: 40, color: '#A0AEC0' },

  cardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  statusCard: { width: CARD_WIDTH, padding: 16, borderRadius: 16, borderWidth: 1, minHeight: 140, justifyContent: 'space-between' },
  cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  cardDesc: { fontSize: 11, lineHeight: 16 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', width: '45%', gap: 10 },
  infoIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDF2F7', justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 10, color: '#718096', fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '800', color: '#2D3748' },

  lastSessionContainer: { marginBottom: 24, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EDF2F7', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSub: { fontSize: 12, color: '#A0AEC0', marginBottom: 16 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F7FAFC' },
  setBadge: { backgroundColor: '#EDF2F7', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  setIndexText: { fontSize: 11, fontWeight: '700', color: '#718096' },
  setMainText: { fontSize: 16, fontWeight: '800', color: '#2D3748', flex: 1 },
  rpeBadge: { backgroundColor: '#F7FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#EDF2F7' },
  rpeText: { fontSize: 11, fontWeight: '700', color: '#718096' },

  section: { marginBottom: 32 },
  chartContainer: { height: GRAPH_HEIGHT },
});