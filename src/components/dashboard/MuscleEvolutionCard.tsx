import React, { useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  LayoutAnimation, 
  Platform, 
  UIManager,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MuscleProgressItem } from '@/services/stats.service';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CONTAINER_PADDING = 12;
const GAP_SIZE = 8;

interface Props {
  data: MuscleProgressItem[];
  currentPeriod: number;
  onPeriodChange: (weeks: number) => void;
  expandedMuscle: string | null;
  onMuscleSelect: (muscle: string) => void;
}

const getSignalStyle = (signal: string) => {
  switch (signal) {
    case 'progress': return { icon: 'trending-up', color: '#38A169', bg: '#F0FFF4', text: 'Evoluindo' };
    case 'regression': return { icon: 'trending-down', color: '#E53E3E', bg: '#FFF5F5', text: 'Atenção' };
    case 'stagnation': return { icon: 'minus', color: '#D69E2E', bg: '#FFFFF0', text: 'Estável' };
    default: return { icon: 'help-circle', color: '#A0AEC0', bg: '#F7FAFC', text: 'Analisando' };
  }
};

export const MuscleEvolutionCard = ({ 
  data, 
  currentPeriod, 
  onPeriodChange,
  expandedMuscle,
  onMuscleSelect 
}: Props) => {

  const handleToggle = (muscle: string) => {
    // Configuração de animação segura
    LayoutAnimation.configureNext(LayoutAnimation.create(
      200, 
      LayoutAnimation.Types.easeInEaseOut, 
      LayoutAnimation.Properties.opacity
    ));
    onMuscleSelect(muscle);
  };

  // Separação em 3 colunas
  const columns = useMemo(() => {
    const col1: MuscleProgressItem[] = [];
    const col2: MuscleProgressItem[] = [];
    const col3: MuscleProgressItem[] = [];

    data.forEach((item, index) => {
      if (index % 3 === 0) col1.push(item);
      else if (index % 3 === 1) col2.push(item);
      else col3.push(item);
    });

    return [col1, col2, col3];
  }, [data]);

  const formatDelta = (val: number) => {
    const rounded = Math.round(val);
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
  };

  const renderCardItem = (item: MuscleProgressItem) => {
    const style = getSignalStyle(item.signal);
    const isExpanded = expandedMuscle === item.muscle_group;

    return (
      <TouchableOpacity 
        key={item.muscle_group}
        style={[styles.itemContainer, isExpanded && styles.itemExpanded]} 
        onPress={() => handleToggle(item.muscle_group)}
        activeOpacity={0.9}
      >
        {/* CABEÇALHO */}
        <View style={styles.headerContent}>
           <View style={[styles.iconCircle, { backgroundColor: style.bg }]}>
              <Feather name={style.icon as any} size={22} color={style.color} />
           </View>
           
           <Text style={styles.muscleTitle} numberOfLines={1} adjustsFontSizeToFit>
             {item.muscle_group}
           </Text>
           
           <Text style={[styles.statusText, { color: style.color }]}>
             {style.text}
           </Text>
        </View>

        {/* DETALHES (Accordion) */}
        {isExpanded && (
          <View style={styles.detailsContainer}>
             <View style={styles.divider} />
             
             {/* VTT */}
             <View style={styles.statBlock}>
                <Text style={styles.statLabel}>VTT Médio</Text>
                <Text style={styles.statValue}>
                  {item.avg_vtt_end >= 1000 
                    ? `${(item.avg_vtt_end/1000).toFixed(1)}k` 
                    : Math.round(item.avg_vtt_end)}
                </Text>
                <Text style={[
                  styles.statDelta, 
                  { color: item.vtt_delta_pct >= 0 ? '#38A169' : '#E53E3E' }
                ]}>
                  {formatDelta(item.vtt_delta_pct)}
                </Text>
             </View>
             
             <View style={styles.miniSeparator} />

             {/* Reps */}
             <View style={styles.statBlock}>
                <Text style={styles.statLabel}>Reps Média</Text>
                <Text style={styles.statValue}>{Math.round(item.avg_reps_end)}</Text>
                <Text style={[
                  styles.statDelta, 
                  { color: item.reps_delta_pct >= 0 ? '#38A169' : '#E53E3E' }
                ]}>
                  {formatDelta(item.reps_delta_pct)}
                </Text>
             </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const PeriodTab = ({ weeks, label }: { weeks: number, label: string }) => (
    <TouchableOpacity 
      style={[styles.tab, currentPeriod === weeks && styles.tabActive]} 
      onPress={() => onPeriodChange(weeks)}
    >
      <Text style={[styles.tabText, currentPeriod === weeks && styles.tabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.topHeader}>
        <Text style={styles.cardTitle}>Evolução por Grupo</Text>
        <View style={styles.periodSelector}>
           <PeriodTab weeks={2} label="7d" />
           <PeriodTab weeks={4} label="30d" />
           <PeriodTab weeks={8} label="60d" />
           <PeriodTab weeks={12} label="90d" />
        </View>
      </View>

      <View style={styles.columnsContainer}>
         {columns.map((colData, colIndex) => (
            <View key={colIndex} style={styles.column}>
               {colData.map((item) => renderCardItem(item))}
            </View>
         ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    marginHorizontal: CARD_MARGIN,
    marginBottom: 20,
    borderRadius: 16,
    padding: CONTAINER_PADDING,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 3,
    borderWidth: 1, borderColor: '#EDF2F7'
  },
  topHeader: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 
  },
  cardTitle: { 
    fontSize: 14, fontWeight: '800', color: '#2D3748', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 
  },
  periodSelector: { 
    flexDirection: 'row', backgroundColor: '#F7FAFC', borderRadius: 8, padding: 2, marginLeft: 8 
  },
  tab: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6 },
  tabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { fontSize: 11, fontWeight: '600', color: '#A0AEC0' },
  tabTextActive: { color: '#2D3748', fontWeight: '800' },

  columnsContainer: {
    flexDirection: 'row', justifyContent: 'space-between', gap: GAP_SIZE, alignItems: 'flex-start' 
  },
  column: { flex: 1, gap: 8 },

  itemContainer: {
    backgroundColor: '#F9FAFB', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4,
    borderWidth: 1, borderColor: '#F0F0F0', alignItems: 'center', overflow: 'hidden', width: '100%' 
  },
  itemExpanded: {
    borderColor: '#CBD5E0', backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
  },
  
  headerContent: { alignItems: 'center', width: '100%', gap: 4 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  muscleTitle: { fontSize: 13, fontWeight: '800', color: '#1A202C', textAlign: 'center', marginBottom: 2 },
  statusText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  detailsContainer: { width: '100%', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', alignItems: 'center' },
  divider: { display: 'none' },
  statBlock: { alignItems: 'center', width: '100%', paddingVertical: 4 },
  miniSeparator: { height: 1, width: '60%', backgroundColor: '#EDF2F7', marginVertical: 4 },
  
  statLabel: { fontSize: 11, color: '#4A5568', fontWeight: '700', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 15, color: '#2D3748', fontWeight: '900' },
  statDelta: { fontSize: 11, fontWeight: '800', marginTop: 1 }
});