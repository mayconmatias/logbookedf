import React, { useState, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView 
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '@/types/navigation';
import { supabase } from '@/lib/supabaseClient';
import { fetchStudentActivePlan } from '@/services/workout_planning.service';
import { fetchCurrentOpenSession } from '@/services/workouts.service';
import { Program, PlannedWorkout } from '@/types/coaching';

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

// [ATUALIZADO] Suporta a nova coluna
type OpenSession = { 
  id: string; 
  template_id: string | null;
  planned_workout_id: string | null; 
} | null;

export default function Home({ navigation }: HomeProps) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('free');
  
  const [activePlan, setActivePlan] = useState<{ program: Program, workouts: PlannedWorkout[] } | null>(null);
  const [currentSession, setCurrentSession] = useState<OpenSession>(null);
  
  const [loadingPlan, setLoadingPlan] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const loadUserData = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, subscription_plan')
              .eq('id', user.id)
              .single();
            
            if (profile) {
              if (profile.display_name) setDisplayName(profile.display_name);
              setSubscriptionPlan(profile.subscription_plan || 'free'); 
            }
          }
        } catch (e) { console.error(e); }
      };
      loadUserData();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const loadDashboard = async () => {
        setLoadingPlan(true);
        try {
          const plan = await fetchStudentActivePlan();
          setActivePlan(plan);

          const session = await fetchCurrentOpenSession();
          setCurrentSession(session); // O TypeScript agora aceita pois atualizamos o tipo

        } catch (e) {
          console.log('Erro dashboard:', e);
        } finally {
          setLoadingPlan(false);
        }
      };
      loadDashboard();
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          style={{ padding: 8, marginRight: 8 }}
        >
          <Feather name="user" size={24} color="#007AFF" />
        </TouchableOpacity>
      ),
      headerBackVisible: false,
    });
  }, [navigation]);

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Erro', error.message);
  };

  const handleHistoryPress = () => {
    navigation.navigate('WorkoutHistory', {});
  };

  const handleStartWorkout = (plannedWorkoutId?: string) => {
    navigation.navigate('LogWorkout', { templateId: plannedWorkoutId });
  };
  
  const handleAccessCoachArea = () => {
    if (subscriptionPlan === 'coach_pro') {
      navigation.navigate('CoachStudentsList');
    } else {
      navigation.navigate('CoachPaywall');
    }
  };

  // [ATUALIZADO] Verifica se é Treino Livre (ambos nulos)
  const isFreeWorkoutOpen = currentSession && !currentSession.template_id && !currentSession.planned_workout_id;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.welcomeText}>
        Bem-vindo, {displayName || 'Atleta'}
      </Text>

      {/* ÁREA DE TREINO PRESCRITO */}
      {loadingPlan ? (
        <ActivityIndicator color="#007AFF" style={{ marginBottom: 20 }} />
      ) : activePlan ? (
        <View style={styles.planCard}>
          <Text style={styles.planTitle}>📋 {activePlan.program.name}</Text>
          
          <Text style={styles.planSubtitle}>
            {(currentSession && currentSession.planned_workout_id)
              ? 'Você tem um treino em andamento:' 
              : 'Selecione o treino de hoje:'}
          </Text>
          
          {activePlan.workouts.map((workout) => {
            // [ATUALIZADO] Compara com o campo correto do Coach
            const isOpen = currentSession?.planned_workout_id === workout.id;

            return (
              <TouchableOpacity 
                key={workout.id} 
                style={[
                  styles.workoutRow, 
                  isOpen && styles.workoutRowActive 
                ]}
                onPress={() => handleStartWorkout(workout.id)}
              >
                <View style={[styles.workoutIcon, isOpen && styles.workoutIconActive]}>
                  {isOpen ? (
                    <Feather name="bar-chart" size={18} color="#FFF" />
                  ) : (
                    <Text style={[styles.workoutLetter, isOpen && { color: '#FFF' }]}>
                      {workout.name.charAt(0)}
                    </Text>
                  )}
                </View>
                
                <View style={{ flex: 1 }}>
                  <Text style={[styles.workoutName, isOpen && styles.workoutNameActive]}>
                    {workout.name}
                  </Text>
                  {isOpen && (
                    <Text style={styles.activeLabel}>EM ANDAMENTO</Text>
                  )}
                </View>

                <Feather 
                  name={isOpen ? "chevron-right" : "play-circle"} 
                  size={24} 
                  color={isOpen ? "#007AFF" : "#007AFF"} 
                />
              </TouchableOpacity>
            );
          })}
          
          {activePlan.workouts.length === 0 && (
            <Text style={styles.emptyPlanText}>Seu coach ainda não adicionou treinos.</Text>
          )}
        </View>
      ) : null}

      {/* Botão Principal (Livre) */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.buttonPrimary, 
            isFreeWorkoutOpen && styles.buttonResume 
          ]}
          onPress={() => handleStartWorkout(undefined)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isFreeWorkoutOpen && <Feather name="clock" size={20} color="#FFF" />}
            <Text style={styles.buttonTextPrimary}>
              {isFreeWorkoutOpen 
                ? 'Retomar Treino Livre' 
                : (activePlan ? 'Treino Livre / Extra' : 'Registrar Treino de Hoje')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={handleHistoryPress}
        >
          <Text style={styles.buttonTextSecondary}>Histórico de Treinos</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate('ExerciseCatalog')}
        >
          <Text style={styles.buttonTextSecondary}>Meus Exercícios</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate('MyPrograms')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="clipboard" size={18} color="#007AFF" />
            <Text style={styles.buttonTextSecondary}>Meus Programas</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.buttonSecondary, { borderColor: '#38A169' }]}
          onPress={() => navigation.navigate('Marketplace')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="shopping-bag" size={18} color="#38A169" />
            <Text style={[styles.buttonTextSecondary, { color: '#38A169' }]}>Loja de Treinos</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.buttonSecondary, { borderColor: '#2B6CB0' }]}
          onPress={handleAccessCoachArea}
        >
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="users" size={18} color="#2B6CB0" />
              <Text style={[styles.buttonTextSecondary, { color: '#2B6CB0' }]}>
                Área do Treinador
              </Text>
           </View>
        </TouchableOpacity>
      </View>

      <View style={styles.logoutButton}>
        <TouchableOpacity style={styles.buttonDanger} onPress={logout}>
          <Text style={styles.buttonTextDanger}>Sair</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    marginVertical: 6,
  },
  logoutButton: {
    width: '100%',
    marginTop: 20,
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  buttonResume: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
    borderWidth: 1,
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDanger: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonTextDanger: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  planCard: {
    width: '100%',
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BEE3F8',
    marginBottom: 20,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2B6CB0',
    marginBottom: 4,
  },
  planSubtitle: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 12,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  workoutRowActive: {
    borderColor: '#007AFF',
    backgroundColor: '#EBF8FF',
  },
  workoutIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#EBF8FF',
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  workoutIconActive: {
    backgroundColor: '#007AFF',
  },
  workoutLetter: { fontWeight: 'bold', color: '#007AFF' },
  workoutName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3748' },
  workoutNameActive: { color: '#007AFF' },
  activeLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 2,
  },
  emptyPlanText: { fontStyle: 'italic', color: '#718096', textAlign: 'center' }
});