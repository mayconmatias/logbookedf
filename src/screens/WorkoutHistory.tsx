// src/screens/WorkoutHistory.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { supabase } from '@/lib/supabase';
import { Calendar, LocaleConfig, DateData } from 'react-native-calendars';
// MUDANÇA AQUI: Importar o ícone de 3 bolinhas
import { Feather } from '@expo/vector-icons';

// (Configuração do Locale)
LocaleConfig.locales['pt-br'] = { monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'], monthNamesShort: ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.',], dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'], dayNamesShort: ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'], today: "Hoje" };
LocaleConfig.defaultLocale = 'pt-br';

// (Tipos)
type WorkoutHistoryItem = {
  id: string;
  workout_date: string;
  exercises: { name: string }[];
};
type WorkoutHistoryProps = NativeStackScreenProps<RootStackParamList, "WorkoutHistory">;

const workoutDot = { color: '#007AFF', key: 'workout' };

export default function WorkoutHistory({ navigation }: WorkoutHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [workoutMarkers, setWorkoutMarkers] = useState<Record<string, any>>({});

  // MUDANÇA AQUI: Adicionar um 'listener' da navegação
  // Isso força a tela a recarregar os dados quando o usuário volta
  // (ex: depois de deletar ou editar um treino)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchHistory(); // Recarrega os dados toda vez que a tela entra em foco
    });

    return unsubscribe; // Limpa o listener ao sair da tela
  }, [navigation]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select(`id, workout_date, exercises ( name )`)
        .order('workout_date', { ascending: false }); 
      if (error) throw error;
      const historyItems = data as WorkoutHistoryItem[];
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

  // MUDANÇA AQUI: Nova função para o menu de opções do treino
  const handleOpenWorkoutMenu = (workout: WorkoutHistoryItem) => {
    Alert.alert(
      `Sessão de ${workout.workout_date}`,
      "O que você gostaria de fazer?",
      [
        // Botão 1: Editar
        {
          text: "Editar Treino",
          onPress: () => {
            // Navega para LogWorkout no MODO EDIÇÃO
            navigation.navigate("LogWorkout", { workoutId: workout.id });
          }
        },
        // Botão 2: Deletar
        {
          text: "Deletar Treino",
          style: "destructive",
          onPress: () => handleDeleteWorkout(workout.id)
        },
        // Botão 3: Cancelar
        {
          text: "Cancelar",
          style: "cancel"
        }
      ]
    );
  };

  // MUDANÇA AQUI: Nova função para DELETAR O TREINO INTEIRO
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
              // 1. Deleta da tabela 'workouts'
              // O 'ON DELETE CASCADE' do SQL deletará todos os 'exercises' e 'sets'
              const { error } = await supabase
                .from("workouts")
                .delete()
                .eq("id", workoutId);
              
              if (error) throw error;
              
              // 2. Atualiza a UI (recarrrega tudo)
              Alert.alert("Sucesso", "Treino deletado.");
              fetchHistory(); // Recarrega os dados para atualizar a lista e as bolinhas

            } catch (e: any) {
              Alert.alert("Erro ao deletar treino", e.message);
            }
          } 
        }
      ]
    );
  };

  const workoutsOnSelectedDate = workouts.filter(w => w.workout_date === selectedDate);

  return (
    <ScrollView style={styles.container}>
      <Calendar
        style={styles.calendar}
        current={selectedDate}
        markedDates={combinedMarkedDates}
        markingType={'multi-dot'}
        onDayPress={(day: DateData) => { setSelectedDate(day.dateString); }}
        theme={{ arrowColor: '#007AFF', todayTextColor: '#007AFF', }}
      />
      
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Treinos em {selectedDate}</Text>
        {loading && <ActivityIndicator />}
        
        {!loading && workoutsOnSelectedDate.length === 0 && (
          <Text style={styles.emptyText}>Nenhum treino registrado neste dia.</Text>
        )}

        {!loading && workoutsOnSelectedDate.map(workout => (
          // MUDANÇA AQUI: O Card de treino agora tem o menu
          <View key={workout.id} style={styles.workoutCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.workoutCardTitle}>Sessão de Treino</Text>
              <TouchableOpacity 
                style={styles.menuButton}
                onPress={() => handleOpenWorkoutMenu(workout)}
              >
                <Feather name="more-vertical" size={20} color="#555" />
              </TouchableOpacity>
            </View>
            
            {workout.exercises.slice(0, 3).map((ex, index) => (
              <Text key={index} style={styles.exerciseText}>- {ex.name}</Text>
            ))}
            {workout.exercises.length > 3 && <Text style={styles.exerciseText}>...</Text>}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// MUDANÇA AQUI: Novos estilos para o cabeçalho do card
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', },
  calendar: { borderBottomWidth: 1, borderColor: '#eee', marginBottom: 10, },
  listContainer: { padding: 20, },
  listTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, },
  emptyText: { fontSize: 16, color: '#777', textAlign: 'center', marginTop: 20, },
  workoutCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workoutCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  menuButton: {
    padding: 8,
  },
  exerciseText: {
    fontSize: 16,
    color: '#555',
    marginLeft: 10,
  }
});