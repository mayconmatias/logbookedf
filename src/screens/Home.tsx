import React, { useState, useLayoutEffect, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '@/types/navigation';
import { supabase } from '@/lib/supabaseClient';
import { fetchStudentActivePlan } from '@/services/workout_planning.service';
import { fetchCurrentOpenSession } from '@/services/workouts.service';
import { Program, PlannedWorkout } from '@/types/coaching';

import * as Updates from 'expo-updates';

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

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

// Adicione isso logo no início do componente Home
useEffect(() => {
  async function checkUpdates() {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          "Update Encontrado!",
          "Baixando nova versão...",
          [{ text: "OK" }]
        );
        await Updates.fetchUpdateAsync();
        Alert.alert(
          "Pronto!",
          "O app será reiniciado para aplicar a atualização.",
          [{ text: "Reiniciar", onPress: () => Updates.reloadAsync() }]
        );
      } else {
        // Comente esta linha depois para não ficar chato
        // Alert.alert("Sem updates", "Você já está na versão mais recente."); 
        console.log("Nenhum update disponível. Runtime atual:", Updates.runtimeVersion);
      }
    } catch (error) {
      // Isso nos dirá se o canal está errado ou se há erro de configuração
      Alert.alert("Erro no Update", `Detalhe: ${error}`);
    }
  }

  // Chama apenas se não estiver em desenvolvimento (simulador rodando metro)
  if (!__DEV__) {
    checkUpdates();
  }
}, []);

  // 1. Carrega dados do usuário (apenas uma vez ou quando foca, mas aqui deixamos no focus para garantir atualização de plano)
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

  // 2. Carrega Dashboard (Plano + Sessão Atual)
  // Roda toda vez que a tela ganha foco -> Garante botão azul ao voltar
  useFocusEffect(
    useCallback(() => {
      const loadDashboard = async () => {
        // Opcional: setLoadingPlan(true) aqui faria um spinner aparecer toda vez que volta. 
        // Para UX mais fluida, podemos deixar sem o loading intrusivo se já tiver dados carregados, 
        // mas para garantir consistência visual no MVP, vamos manter.
        setLoadingPlan(true); 
        try {
          const plan = await fetchStudentActivePlan();
          setActivePlan(plan);

          const session = await fetchCurrentOpenSession();
          setCurrentSession(session); 

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
          // [UI] Área de toque aumentada
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          style={{ marginRight: 8 }}
        >
          <View style={styles.profileIconBg}>
             <Feather name="user" size={22} color="#007AFF" />
          </View>
        </TouchableOpacity>
      ),
      headerBackVisible: false,
    });
  }, [navigation]);

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Erro', error.message);
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

  // Lógica do Botão Principal:
  // Se tem sessão aberta E não é de um template específico (ou seja, é livre), mostra "Retomar"
  const isFreeWorkoutOpen = currentSession && !currentSession.template_id && !currentSession.planned_workout_id;

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.welcomeText}>
        Buenas, {displayName || 'Atleta'}
      </Text>

      {/* ÁREA DE TREINO PRESCRITO (COACH) */}
      {loadingPlan ? (
        <ActivityIndicator color="#007AFF" style={{ marginBottom: 20, marginTop: 20 }} />
      ) : activePlan ? (
        <View style={styles.planCard}>
          <Text style={styles.planTitle}>📋 {activePlan.program.name}</Text>
          
          <Text style={styles.planSubtitle}>
            {(currentSession && currentSession.planned_workout_id)
              ? 'Você tem um treino em andamento:' 
              : 'Selecione o treino de hoje:'}
          </Text>
          
          {activePlan.workouts.map((workout) => {
            // Verifica se ESTE treino específico está aberto
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
                    <Feather name="bar-chart-2" size={18} color="#FFF" />
                  ) : (
                    <Text style={[styles.workoutLetter, isOpen && { color: '#FFF' }]}>
                      {workout.name.charAt(0).toUpperCase()}
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

      {/* Botão Principal (Treino Livre) */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.buttonPrimary, 
            isFreeWorkoutOpen ? styles.buttonResume : {} 
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
          onPress={() => navigation.navigate('WorkoutHistory', {})}
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
  container: { flexGrow: 1, alignItems: 'center', padding: 20, backgroundColor: '#fff', paddingBottom: 40 },
  welcomeText: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', marginTop: 10 },
  
  buttonContainer: { width: '100%', marginVertical: 6 },
  logoutButton: { width: '100%', marginTop: 20 },
  
  buttonPrimary: { backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.1, shadowRadius:4, elevation:3 },
  buttonResume: { backgroundColor: '#D97706', borderColor: '#B45309', borderWidth: 1 },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '700' },
  
  buttonSecondary: { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF' },
  buttonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  
  buttonDanger: { backgroundColor: '#FFF5F5', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonTextDanger: { color: '#E53E3E', fontSize: 16, fontWeight: '600' },
  
  planCard: { width: '100%', backgroundColor: '#F0F9FF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#BEE3F8', marginBottom: 20 },
  planTitle: { fontSize: 18, fontWeight: 'bold', color: '#2B6CB0', marginBottom: 4 },
  planSubtitle: { fontSize: 14, color: '#4A5568', marginBottom: 12 },
  
  workoutRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, borderWidth: 1, borderColor: '#EDF2F7' },
  workoutRowActive: { borderColor: '#007AFF', backgroundColor: '#EBF8FF' },
  
  workoutIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F7FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth:1, borderColor: '#E2E8F0' },
  workoutIconActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  
  workoutLetter: { fontWeight: 'bold', color: '#007AFF', fontSize: 16 },
  workoutName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3748' },
  workoutNameActive: { color: '#007AFF' },
  
  activeLabel: { fontSize: 10, fontWeight: 'bold', color: '#007AFF', marginTop: 2, letterSpacing: 0.5 },
  
  emptyPlanText: { fontStyle: 'italic', color: '#718096', textAlign: 'center' },
  
  // [UI] Botão de perfil refinado
  profileIconBg: { backgroundColor: '#F0F9FF', padding: 10, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0' }
});