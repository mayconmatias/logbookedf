import React, { useState, useEffect, useMemo } from 'react'; 
import { 
  View, Text, StyleSheet, ScrollView, 
  ActivityIndicator, Alert, TouchableOpacity,
  LayoutAnimation, Platform, UIManager 
} from 'react-native'; 
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Calendar, LocaleConfig, DateData } from 'react-native-calendars';
import { Feather } from '@expo/vector-icons'; 

import WorkoutShareModal from '@/components/WorkoutShareModal'; 

// Importa os tipos globais
import type { RootStackParamList } from "@/types/navigation";
import type { 
  WorkoutHistoryItem, 
  WorkoutExercise,
  HistoricalRepPR,
  HistoricalWeightPR,
  WorkoutSet 
} from "@/types/workout"; 
import { supabase } from "@/lib/supabaseClient";

// Habilita animações no Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

LocaleConfig.locales['pt-br'] = { monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'], monthNamesShort: ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.',], dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'], dayNamesShort: ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'], today: "Hoje" };
LocaleConfig.defaultLocale = 'pt-br';

type WorkoutHistoryProps = NativeStackScreenProps<RootStackParamList, "WorkoutHistory">;

const workoutDot = { color: '#007AFF', key: 'workout' };

// --- Helper para agrupar séries (Lógica similar ao ShareableCard) ---
const getGroupedSetsSummary = (sets: WorkoutSet[]) => {
  if (!sets || sets.length === 0) return [];

  const groups: { count: number; weight: number; reps: number; side?: string }[] = [];

  sets.forEach(set => {
    if (set.weight === 0 && set.reps === 0) return; // Ignora ghost sets

    const existing = groups.find(
      g => g.weight === set.weight && g.reps === set.reps && g.side === set.side
    );

    if (existing) {
      existing.count += 1;
    } else {
      groups.push({
        count: 1,
        weight: set.weight,
        reps: set.reps,
        side: set.side,
      });
    }
  });

  // Formata para string
  return groups.map(g => {
    const side = g.side ? ` (${g.side})` : '';
    return `${g.count} x ${g.weight}kg - ${g.reps} reps${side}`;
  });
};

export default function WorkoutHistory({ navigation, route }: WorkoutHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [workoutMarkers, setWorkoutMarkers] = useState<Record<string, any>>({});
 
  // Controle de expansão dos cards (Set de IDs)
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<Set<string>>(new Set());

  const [isWorkoutShareModalVisible, setIsWorkoutShareModalVisible] = useState(false);
  const [workoutToShare, setWorkoutToShare] = useState<WorkoutHistoryItem | null>(null);
  
  const [isFetchingPRs, setIsFetchingPRs] = useState(false);
  const [repPRs, setRepPRs] = useState<HistoricalRepPR[]>([]);
  const [weightPRs, setWeightPRs] = useState<HistoricalWeightPR[]>([]);

  const highlightId = route.params?.highlightWorkoutId;

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchHistory(); 
    });
    return unsubscribe; 
  }, [navigation]);

  useEffect(() => {
    if (loading || !highlightId || isWorkoutShareModalVisible) return;
    const workoutToShare = workouts.find(w => w.id === highlightId);
    if (workoutToShare) {
      // Se veio de um redirecionamento, expande o card automaticamente
      toggleExpand(highlightId); 
      navigation.setParams({ highlightWorkoutId: undefined });
    } 
  }, [loading, workouts, highlightId, navigation, isWorkoutShareModalVisible]); 

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('workouts')
        .select(`
          id, 
          workout_date,
          user_id,
          exercises ( 
            id, 
            definition_id,
            definition:exercise_definitions ( name ),
            sets ( weight, reps, side, set_number ) 
          )
        `)
        .eq('user_id', user.id)
        .order('workout_date', { ascending: false })
        .order('created_at', { referencedTable: 'exercises', ascending: true })
        .order('set_number', { referencedTable: 'exercises.sets', ascending: true }); 
       
      if (error) throw error;
     
      const historyItems: WorkoutHistoryItem[] = data.map((workout: any) => {
        const [year, month, day] = workout.workout_date.split('-');
        const formattedTitle = `Treino do dia ${day}-${month}`;

        return {
          id: workout.id,
          workout_date: workout.workout_date,
          user_id: workout.user_id,
          template_name: formattedTitle, 
          performed_data: workout.exercises.map((ex: any) => ({
            id: ex.id,
            definition_id: ex.definition_id,
            name: ex.definition ? ex.definition.name : 'Exercício Excluído',
            sets: ex.sets || [],
          })),
        };
      });

      setWorkouts(historyItems);
      processWorkoutsForMarking(historyItems);
    } catch (e: any) {
      Alert.alert("Erro ao buscar histórico", e.message);
    } finally {
      setLoading(false);
    }
  };

  const processWorkoutsForMarking = (workoutsData: WorkoutHistoryItem[]) => {
    const workoutsPerDay: { [date: string]: WorkoutHistoryItem[] } = {};
    workoutsData.forEach(workout => {
      const date = workout.workout_date;
      if (!workoutsPerDay[date]) { workoutsPerDay[date] = []; }
      workoutsPerDay[date].push(workout);
    });
    const markers: Record<string, any> = {};
    Object.keys(workoutsPerDay).forEach(dateString => {
      const dayWorkouts = workoutsPerDay[dateString];
      const dotCount = Math.min(dayWorkouts.length, 4);
      markers[dateString] = {
        dots: Array.from({ length: dotCount }, (_, index) => ({ ...workoutDot, key: `workout${index}` })),
      };
    });
    setWorkoutMarkers(markers);
  };
  
  const combinedMarkedDates = useMemo(() => {
    const newMarkedDates = { ...workoutMarkers };
    if (newMarkedDates[selectedDate]) {
      newMarkedDates[selectedDate] = { ...newMarkedDates[selectedDate], selected: true, selectedColor: '#007AFF', };
    } else {
      newMarkedDates[selectedDate] = { selected: true, selectedColor: '#007AFF', dots: [] };
    }
    return newMarkedDates;
  }, [workoutMarkers, selectedDate]);

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedWorkoutIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleOpenWorkoutMenu = (workout: WorkoutHistoryItem) => {
    Alert.alert(
      `Opções do Treino`,
      "O que você gostaria de fazer?",
      [
        {
          text: "Editar Treino",
          onPress: () => {
            navigation.navigate("LogWorkout", { workoutId: workout.id });
          }
        },
        {
          text: "Deletar Treino",
          style: "destructive",
          onPress: () => handleDeleteWorkout(workout.id)
        },
        {
          text: "Cancelar",
          style: "cancel"
        }
      ]
    );
  };
 
  const handleDeleteWorkout = (workoutId: string) => {
    Alert.alert(
      "Deletar Treino",
      "Tem certeza que deseja deletar esta sessão inteira? Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Deletar", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("workouts")
                .delete()
                .eq("id", workoutId);
             
              if (error) throw error;
             
              Alert.alert("Sucesso", "Treino deletado.");
              fetchHistory(); 

            } catch (e: any) {
              Alert.alert("Erro ao deletar treino", e.message);
            }
          } 
        }
      ]
    );
  };

  const handleSharePress = (workout: WorkoutHistoryItem) => {
    openShareModal(workout);
  };

  const openShareModal = async (workout: WorkoutHistoryItem) => {
    setIsFetchingPRs(true);
    setWorkoutToShare(workout); 
    setIsWorkoutShareModalVisible(true);
   
    try {
      const definitionIds = workout.performed_data.map(ex => ex.definition_id);
     
      if (definitionIds.length === 0) {
        setRepPRs([]);
        setWeightPRs([]);
        setIsFetchingPRs(false);
        return;
      }

      const [repPRsData, weightPRsData] = await Promise.all([
        supabase.rpc('get_historical_rep_prs', {
          p_definition_ids: definitionIds,
          p_exclude_workout_id: workout.id
        }),
        supabase.rpc('get_historical_weight_prs', {
          p_definition_ids: definitionIds,
          p_exclude_workout_id: workout.id
        })
      ]);

      if (repPRsData.error) throw repPRsData.error;
      if (weightPRsData.error) throw weightPRsData.error;

      setRepPRs(repPRsData.data as HistoricalRepPR[]);
      setWeightPRs(weightPRsData.data as HistoricalWeightPR[]);
     
    } catch (e: any) {
      Alert.alert("Erro ao buscar recordes", e.message);
      setRepPRs([]); 
      setWeightPRs([]);
    } finally {
      setIsFetchingPRs(false); 
    }
  };
 
  const closeWorkoutShareModal = () => {
    setIsWorkoutShareModalVisible(false);
    setWorkoutToShare(null);
    setRepPRs([]); 
    setWeightPRs([]);
  }

  const workoutsOnSelectedDate = workouts.filter(w => w.workout_date === selectedDate);

  return (
    <ScrollView style={styles.container}>
      
      <WorkoutShareModal
        visible={isWorkoutShareModalVisible}
        onClose={closeWorkoutShareModal}
        isFetchingPRs={isFetchingPRs}
        workout={workoutToShare}
        repPRs={repPRs}
        weightPRs={weightPRs}
      />
     
      <Calendar
        style={styles.calendar}
        current={selectedDate}
        markedDates={combinedMarkedDates}
        markingType={'multi-dot'}
        onDayPress={(day: DateData) => { setSelectedDate(day.dateString); }}
        theme={{ arrowColor: '#007AFF', todayTextColor: '#007AFF', }}
      />
     
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>
          Treinos em {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
        </Text>
        {loading && <ActivityIndicator />}
       
        {!loading && workoutsOnSelectedDate.length === 0 && (
          <Text style={styles.emptyText}>Nenhum treino registrado neste dia.</Text>
        )}

        {!loading && workoutsOnSelectedDate.map(workout => {
          const isExpanded = expandedWorkoutIds.has(workout.id);

          return (
            <TouchableOpacity
              key={workout.id}
              style={styles.workoutCard}
              onPress={() => toggleExpand(workout.id)}
              onLongPress={() => handleOpenWorkoutMenu(workout)}
              delayLongPress={500}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.workoutCardTitle}>
                  {workout.template_name}
                </Text>

                <View style={styles.buttonRow}>
                   {/* Botão de Share Mantido, mas isolado */}
                  <TouchableOpacity 
                    style={styles.iconButton}
                    onPress={() => handleSharePress(workout)}
                  >
                    <Feather name="share" size={20} color="#007AFF" />
                  </TouchableOpacity>
                  
                  {/* Ícone de Seta para indicar expansão */}
                  <View style={styles.iconButton}>
                     <Feather 
                       name={isExpanded ? "chevron-up" : "chevron-down"} 
                       size={20} 
                       color="#A0AEC0" 
                     />
                  </View>
                </View>
              </View>
              
              {/* Conteúdo: Lista de Exercícios */}
              <View>
                {workout.performed_data.map((ex, index) => {
                  const setsSummary = getGroupedSetsSummary(ex.sets);
                  
                  return (
                    <View key={index} style={styles.exerciseRow}>
                      {/* Nome do Exercício */}
                      <Text style={styles.exerciseTitle}>
                         • {ex.name}
                      </Text>
                      
                      {/* Detalhes (Aparecem só se expandido) */}
                      {isExpanded && (
                        <View style={styles.setsContainer}>
                           {setsSummary.length > 0 ? (
                             setsSummary.map((line, idx) => (
                               <Text key={idx} style={styles.setText}>
                                  {line}
                               </Text>
                             ))
                           ) : (
                             <Text style={styles.setText}>Sem séries registradas.</Text>
                           )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              
              {/* Dica Visual no Rodapé do Card quando recolhido */}
              {!isExpanded && (
                 <Text style={styles.hintText}>Toque para ver detalhes • Segure para editar</Text>
              )}

            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', },
  calendar: { borderBottomWidth: 1, borderColor: '#eee', marginBottom: 10, },
  listContainer: { padding: 20, paddingBottom: 40 },
  listTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, },
  emptyText: { fontSize: 16, color: '#777', textAlign: 'center', marginTop: 20, },
  
  workoutCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    // Sombra mais bonita
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
    paddingBottom: 8
  },
  workoutCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    color: '#2D3748', 
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  
  exerciseRow: {
    marginBottom: 8,
  },
  exerciseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 2,
  },
  setsContainer: {
    paddingLeft: 14,
    marginTop: 2,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#E2E8F0'
  },
  setText: {
    fontSize: 14,
    color: '#718096',
    lineHeight: 20,
  },
  hintText: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic'
  }
});