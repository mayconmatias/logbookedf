import React, { useState, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  StatusBar,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import type { RootStackParamList } from '@/types/navigation';
import { supabase } from '@/lib/supabaseClient';
import { fetchStudentActivePlan } from '@/services/workout_planning.service';
import { fetchCurrentOpenSession, fetchThisWeekWorkoutDays } from '@/services/workouts.service';
// [NOVO] Import do serviço de coaching
import { fetchUnreadCoachMessage, markMessageAsRead, CoachingMessage } from '@/services/coaching.service';
import { Program, PlannedWorkout } from '@/types/coaching';
import { HOME_MESSAGE } from '@/utils/announcements';

// Ativar animação para o dismiss ficar suave
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

type OpenSession = { 
  id: string; 
  template_id: string | null;
  planned_workout_id: string | null; 
} | null;

const { width } = Dimensions.get('window');

// --- Componente do Feedback do Coach (Novo) ---
const CoachFeedbackBanner = ({ message, onDismiss }: { message: CoachingMessage | null, onDismiss: () => void }) => {
  if (!message) return null;

  return (
    <View style={styles.feedbackContainer}>
      <LinearGradient
        colors={['#E6FFFA', '#B2F5EA']} // Ciano/Verde suave (Tons de cuidado/saúde)
        start={{x:0, y:0}} end={{x:1, y:1}}
        style={styles.feedbackGradient}
      >
        <View style={styles.feedbackHeader}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Feather name="message-circle" size={18} color="#2C7A7B" />
            <Text style={styles.feedbackLabel}>Mensagem do Treinador</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <Feather name="x" size={18} color="#2C7A7B" />
          </TouchableOpacity>
        </View>
        <Text style={styles.feedbackText}>
          "{message.content}"
        </Text>
        <Text style={styles.feedbackDate}>
          {new Date(message.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </LinearGradient>
    </View>
  );
};

const WeeklyTracker = ({ activeDays }: { activeDays: number[] }) => {
  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const todayIndex = new Date().getDay();
  
  return (
    <View style={styles.weeklyContainer}>
      <Text style={styles.sectionHeaderSmall}>Frequência</Text>
      <View style={styles.daysRow}>
        {days.map((day, index) => {
          const isToday = index === todayIndex;
          const isCompleted = activeDays.includes(index);
          return (
            <View key={index} style={styles.dayWrapper}>
              <View style={[
                styles.dayCircle, 
                isCompleted && styles.dayCompleted,
                isToday && !isCompleted && styles.dayToday
              ]}>
                {isCompleted && <Feather name="check" size={10} color="#FFF" />}
              </View>
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{day}</Text>
            </View>
          )
        })}
      </View>
    </View>
  );
};

export default function Home({ navigation }: HomeProps) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<{ program: Program, workouts: PlannedWorkout[] } | null>(null);
  const [currentSession, setCurrentSession] = useState<OpenSession>(null);
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  
  // [NOVO] Estado da mensagem
  const [coachMessage, setCoachMessage] = useState<CoachingMessage | null>(null);

  useFocusEffect(
    useCallback(() => {
      const loadUserData = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
            if (profile) setDisplayName(profile.display_name?.split(' ')[0] || null);
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
          const [plan, session, freq, msg] = await Promise.all([
            fetchStudentActivePlan(),
            fetchCurrentOpenSession(),
            fetchThisWeekWorkoutDays(),
            fetchUnreadCoachMessage() // [NOVO] Busca mensagem
          ]);
          setActivePlan(plan);
          setCurrentSession(session);
          setWeekDays(freq);
          setCoachMessage(msg);
        } catch (e) { console.log('Erro dashboard:', e); } finally { setLoadingPlan(false); }
      };
      loadDashboard();
    }, [])
  );

  // [NOVO] Função de Dismiss
  const handleDismissMessage = async () => {
    if (!coachMessage) return;
    
    // Animação visual imediata
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const msgId = coachMessage.id;
    setCoachMessage(null); // Esconde na hora

    try {
      await markMessageAsRead(msgId);
    } catch (e) {
      console.error("Erro ao marcar como lida:", e);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: '#F7FAFC' },
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.profileButton}>
          <Feather name="user" size={18} color="#4A5568" />
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <View style={{ marginLeft: 4 }}>
          <Text style={styles.logoText}>Logbook<Text style={{color: '#007AFF'}}>EdF</Text></Text>
        </View>
      ),
    });
  }, [navigation]);

  const handleStartWorkout = (plannedWorkoutId?: string) => {
    navigation.navigate('LogWorkout', { templateId: plannedWorkoutId });
  };

  const isFreeWorkoutOpen = currentSession && !currentSession.template_id && !currentSession.planned_workout_id;

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.greetingSection}>
        <View>
          <Text style={styles.greetingText}>Olá, {displayName || 'Atleta'} 👋</Text>
          <Text style={styles.subGreeting}>{HOME_MESSAGE || "Vamos evoluir hoje?"}</Text>
        </View>
      </View>

      {/* [NOVO] Banner de Mensagem do Coach (Só aparece se existir) */}
      <CoachFeedbackBanner 
        message={coachMessage} 
        onDismiss={handleDismissMessage} 
      />

      <WeeklyTracker activeDays={weekDays} />

      {/* --- PLANO ATIVO (Carrossel Compacto) --- */}
      {!loadingPlan && activePlan && (
        <View style={styles.sectionCompact}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderSmall}>Seu Plano</Text>
            <Text style={styles.planNameSmall}>{activePlan.program.name}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsScrollCompact}>
            {activePlan.workouts.map((workout, index) => {
              const isOpen = currentSession?.planned_workout_id === workout.id;
              const gradients = [ ['#007AFF', '#0056b3'], ['#38A169', '#276749'], ['#805AD5', '#553C9A'], ['#D69E2E', '#975A16'] ];
              return (
                <TouchableOpacity key={workout.id} onPress={() => handleStartWorkout(workout.id)} activeOpacity={0.9}>
                  <LinearGradient
                    colors={isOpen ? ['#E53E3E', '#9B2C2C'] : gradients[index % gradients.length] as any}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.workoutCardCompact}
                  >
                    <View style={styles.cardContentCompact}>
                       <Text style={styles.cardTitleCompact} numberOfLines={2}>{workout.name}</Text>
                       <Text style={styles.cardActionCompact}>{isOpen ? 'RETOMAR' : 'INICIAR'}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* --- GRID DE AÇÃO (Menu Compacto) --- */}
      <View style={styles.menuGrid}>
        
        <View style={styles.gridRow}>
          <TouchableOpacity 
            style={[styles.cardButton, isFreeWorkoutOpen ? styles.freeWorkoutActive : styles.freeWorkoutNormal]} 
            onPress={() => handleStartWorkout(undefined)}
          >
            <View style={[styles.iconCircle, { backgroundColor: isFreeWorkoutOpen ? 'rgba(255,255,255,0.2)' : '#FFF3C4' }]}>
              <Feather name="play" size={24} color={isFreeWorkoutOpen ? '#FFF' : '#D97706'} />
            </View>
            <View>
              <Text style={[styles.cardButtonTitle, isFreeWorkoutOpen ? {color:'#FFF'} : {color:'#D97706'}]}>
                {isFreeWorkoutOpen ? 'Retomar' : 'Treino Livre'}
              </Text>
              <Text style={[styles.cardButtonSub, isFreeWorkoutOpen ? {color:'rgba(255,255,255,0.8)'} : {color:'#B7791F'}]}>
                Sem planilha
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.cardButton, { borderColor: '#D6BCFA' }]} 
            onPress={() => navigation.navigate('Dashboard')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FAF5FF' }]}>
              <Feather name="activity" size={24} color="#805AD5" />
            </View>
            <View>
              <Text style={[styles.cardButtonTitle, { color: '#553C9A' }]}>Evolução</Text>
              <Text style={styles.cardButtonSub}>Métricas</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.gridRow}>
          <TouchableOpacity 
            style={styles.cardButton} 
            onPress={() => navigation.navigate('MyPrograms')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EBF8FF' }]}>
              <Feather name="layers" size={24} color="#007AFF" />
            </View>
            <View>
              <Text style={styles.cardButtonTitle}>Programas</Text>
              <Text style={styles.cardButtonSub}>Gerenciar</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.cardButton, { borderColor: '#4A5568' }]} 
            onPress={() => navigation.navigate('CoachStudentsList')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EDF2F7' }]}>
              <Feather name="users" size={24} color="#2D3748" />
            </View>
            <View>
              <Text style={styles.cardButtonTitle}>Área do treinador</Text>
              <Text style={styles.cardButtonSub}>Plano profissional</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.gridRowSmall}>
          <TouchableOpacity style={styles.smallButton} onPress={() => navigation.navigate('WorkoutHistory')}>
            <Feather name="clock" size={18} color="#4A5568" />
            <Text style={styles.smallButtonText}>Histórico</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallButton} onPress={() => navigation.navigate('ExerciseCatalog')}>
            <Feather name="list" size={18} color="#4A5568" />
            <Text style={styles.smallButtonText}>Exercícios</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallButton} onPress={() => navigation.navigate('Marketplace')}>
            <Feather name="shopping-bag" size={18} color="#4A5568" />
            <Text style={styles.smallButtonText}>Loja</Text>
          </TouchableOpacity>
        </View>

      </View>

      <TouchableOpacity style={styles.logoutLink} onPress={async () => await supabase.auth.signOut()}>
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F7FAFC', paddingTop: 10, paddingHorizontal: 16 },
  logoText: { fontSize: 18, fontWeight: '800', color: '#1A202C' },
  profileButton: { backgroundColor: '#FFF', padding: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  
  greetingSection: { marginBottom: 16, marginTop: 4 },
  greetingText: { fontSize: 22, fontWeight: 'bold', color: '#1A202C' },
  subGreeting: { fontSize: 14, color: '#718096', marginTop: 2 },

  // [NOVO] Estilo Feedback Banner
  feedbackContainer: { marginBottom: 20 },
  feedbackGradient: { borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#81E6D9' },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  feedbackLabel: { fontSize: 12, fontWeight: '700', color: '#285E61', textTransform: 'uppercase' },
  feedbackText: { fontSize: 14, color: '#234E52', fontStyle: 'italic', lineHeight: 20, marginBottom: 4 },
  feedbackDate: { fontSize: 10, color: '#38B2AC', textAlign: 'right', fontWeight: '600' },

  weeklyContainer: { flexDirection: 'column', marginBottom: 20, backgroundColor: '#FFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EDF2F7' },
  sectionHeaderSmall: { fontSize: 11, fontWeight: '700', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayWrapper: { alignItems: 'center', gap: 4 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EDF2F7', alignItems: 'center', justifyContent: 'center' },
  dayCompleted: { backgroundColor: '#38A169' },
  dayToday: { borderWidth: 2, borderColor: '#007AFF', backgroundColor: '#FFF' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#007AFF' },
  dayLabel: { fontSize: 10, color: '#A0AEC0', fontWeight: '600' },
  dayLabelToday: { color: '#007AFF' },

  sectionCompact: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  planNameSmall: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
  cardsScrollCompact: { gap: 10 },
  workoutCardCompact: { width: 130, height: 70, borderRadius: 10, padding: 10, justifyContent: 'center' },
  cardContentCompact: { alignItems: 'center', justifyContent: 'center' },
  cardTitleCompact: { color: '#FFF', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 2 },
  cardActionCompact: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  emptyPlanText: { fontStyle: 'italic', color: '#718096' },
  createPlanBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#EBF8FF', borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#BEE3F8', borderStyle: 'dashed' },
  createPlanText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },

  menuGrid: { gap: 10, marginBottom: 20 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridRowSmall: { flexDirection: 'row', gap: 10, marginTop: 4 },

  cardButton: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 100,
    justifyContent: 'space-between',
    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 3, elevation: 1
  },
  freeWorkoutNormal: { backgroundColor: '#FFFAF0', borderColor: '#FBD38D' }, 
  freeWorkoutActive: { backgroundColor: '#C05621', borderColor: '#C05621' }, 

  cardButtonTitle: { fontSize: 14, fontWeight: '700', color: '#2D3748', marginBottom: 1 },
  cardButtonSub: { fontSize: 11, color: '#A0AEC0' },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },

  smallButton: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6
  },
  smallButtonText: { fontSize: 11, fontWeight: '600', color: '#4A5568' },

  logoutLink: { alignSelf: 'center', padding: 10 },
  logoutText: { color: '#E53E3E', fontSize: 12, fontWeight: '600' }
});