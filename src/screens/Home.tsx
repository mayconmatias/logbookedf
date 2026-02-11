import React, { useState, useLayoutEffect, useCallback, useEffect, useRef } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage'; // [NOVO]

import type { RootStackParamList } from '@/types/navigation';
import { supabase } from '@/lib/supabaseClient';
import { fetchStudentActivePlan } from '@/services/workout_planning.service';
import { fetchCurrentOpenSession, fetchThisWeekWorkoutDays, sanitizeOpenSessions } from '@/services/workouts.service';
import { fetchUnreadCoachMessage, markMessageAsRead, CoachingMessage } from '@/services/coaching.service';
import { Program, PlannedWorkout } from '@/types/coaching';
import { HOME_MESSAGE } from '@/utils/announcements';
import { fetchNotifications } from '@/services/notifications.service';
import { checkPlanValidity } from '@/utils/date';
import { syncStravaActivities } from '@/services/strava.service';

// [NOVO] Import do Tutorial
import { TutorialModal } from '@/components/TutorialModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

type OpenSession = {
  id: string;
  template_id: string | null;
  planned_workout_id: string | null;
} | null;

const CoachFeedbackBanner = ({ message, onDismiss }: { message: CoachingMessage | null, onDismiss: () => void }) => {
  if (!message) return null;
  return (
    <View style={styles.feedbackContainer}>
      <LinearGradient colors={['#E6FFFA', '#B2F5EA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.feedbackGradient}>
        <View style={styles.feedbackHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="message-circle" size={18} color="#2C7A7B" />
            <Text style={styles.feedbackLabel}>Mensagem do Treinador</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={18} color="#2C7A7B" />
          </TouchableOpacity>
        </View>
        <Text style={styles.feedbackText}>"{message.content}"</Text>
        <Text style={styles.feedbackDate}>{new Date(message.created_at).toLocaleDateString('pt-BR')}</Text>
      </LinearGradient>
    </View>
  );
};

const WeeklyTracker = ({ workoutDays, cardioDays }: { workoutDays: number[], cardioDays: number[] }) => {
  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const todayIndex = new Date().getDay();
  return (
    <View style={styles.weeklyContainer}>
      <Text style={styles.sectionHeaderSmall}>Frequência</Text>
      <View style={styles.daysRow}>
        {days.map((day, index) => {
          const isToday = index === todayIndex;
          const hasWorkout = workoutDays.includes(index);
          const hasCardio = cardioDays.includes(index);
          const isCompleted = hasWorkout || hasCardio;

          return (
            <View key={index} style={styles.dayWrapper}>
              <View style={[
                styles.dayCircle,
                isCompleted && styles.dayCompleted,
                isToday && !isCompleted && styles.dayToday,
                (hasCardio && !hasWorkout) && { backgroundColor: '#FC4C02' } // Strava Orange if ONLY cardio
              ]}>
                {hasWorkout ? (
                  <Feather name="check" size={10} color="#FFF" />
                ) : hasCardio ? (
                  <Feather name="activity" size={10} color="#FFF" />
                ) : null}
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
  const insets = useSafeAreaInsets();

  // Estados de Dados
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<{ program: Program, workouts: PlannedWorkout[] } | null>(null);
  const [currentSession, setCurrentSession] = useState<OpenSession>(null);
  const [weekDays, setWeekDays] = useState<{ workoutDays: number[], cardioDays: number[] }>({ workoutDays: [], cardioDays: [] });
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [coachMessage, setCoachMessage] = useState<CoachingMessage | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasTodayCardio, setHasTodayCardio] = useState(false);

  // Controle de Sincronização Strava (uma vez por sessão)
  const hasSyncedStrava = useRef(false);

  // [NOVO] Estado do Tutorial
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 1. Verifica Onboarding na montagem e reseta flag de sync
  useEffect(() => {
    // IMPORTANTE: Reseta o flag de sync para garantir que rode em desenvolvimento
    console.log('DEBUG: Componente montado, resetando hasSyncedStrava');
    hasSyncedStrava.current = false;

    const checkOnboarding = async () => {
      try {
        const hasSeen = await AsyncStorage.getItem('@has_seen_onboarding_v1');
        if (!hasSeen) {
          // Pequeno delay para garantir que a UI carregou
          setTimeout(() => setShowOnboarding(true), 1500);
        }
      } catch (e) { console.log(e); }
    };
    checkOnboarding();
  }, []);

  // 2. Carrega Perfil
  useFocusEffect(
    useCallback(() => {
      const loadUserData = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', user.id)
              .single();
            if (profile) setDisplayName(profile.display_name?.split(' ')[0] || null);
          }
        } catch (e) { console.error(e); }
      };
      loadUserData();
    }, [])
  );

  // 3. Configura Realtime Badge
  useEffect(() => {
    const refreshBadge = async () => {
      try {
        const notifs = await fetchNotifications();
        setUnreadCount(notifs.filter(n => !n.is_read).length);
      } catch (e) { console.log(e); }
    };

    refreshBadge();

    const channel = supabase.channel('home_badge_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'coaching_messages' }, () => refreshBadge())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'exercise_messages' }, () => refreshBadge())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 4. Carrega Dashboard (Plano, Sessão, Frequência)
  const loadDashboard = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await sanitizeOpenSessions();

      // Busca hoje (se houve atividade externa hoje)
      const today = new Date().toISOString().split('T')[0];
      const todayQuery = supabase
        .from('external_activities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('start_date_local', `${today}T00:00:00`)
        .lte('start_date_local', `${today}T23:59:59`);

      const [plan, session, freq, msg, notifs, todayCardio] = await Promise.all([
        fetchStudentActivePlan(),
        fetchCurrentOpenSession(),
        fetchThisWeekWorkoutDays(),
        fetchUnreadCoachMessage(),
        fetchNotifications(),
        todayQuery
      ]);

      console.log('DEBUG Today Cardio Query:', {
        queryRange: `${today}T00:00:00 to ${today}T23:59:59`,
        count: todayCardio.count,
        data: todayCardio.data
      });

      setActivePlan(plan);
      setCurrentSession(session);
      setWeekDays(freq);
      setCoachMessage(msg);
      setUnreadCount(notifs.filter(n => !n.is_read).length);
      setHasTodayCardio((todayCardio.count ?? 0) > 0);

      console.log('DEBUG Home Dashboard:', {
        hasPlan: !!plan,
        hasSession: !!session,
        weekDays: freq,
        hasTodayCardio: (todayCardio.count ?? 0) > 0,
        todayCardioCount: todayCardio.count
      });
    } catch (e) {
      console.log('Erro dashboard:', e);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  // 5. Sincronização Strava (uma vez por sessão)
  useEffect(() => {
    const runSync = async () => {
      console.log('DEBUG: runSync iniciado, hasSyncedStrava.current =', hasSyncedStrava.current);
      if (hasSyncedStrava.current) {
        console.log('DEBUG: Sync já foi executado nesta sessão, pulando');
        return;
      }
      try {
        console.log('DEBUG: Chamando syncStravaActivities...');
        const { success, count } = await syncStravaActivities();
        console.log('DEBUG: syncStravaActivities retornou:', { success, count });
        if (success) {
          hasSyncedStrava.current = true;
          if (count > 0) {
            console.log('DEBUG: Recarregando dashboard com', count, 'novas atividades');
            loadDashboard();
          } else {
            console.log('DEBUG: Nenhuma atividade nova encontrada');
          }
        } else {
          console.log('DEBUG: Sincronização falhou (success=false)');
        }
      } catch (e) {
        console.log('Strava sync fail:', e);
      }
    };

    // Pequeno delay para não competir com a carga inicial e garantir que o user já está na Home
    const timer = setTimeout(runSync, 3000);
    return () => clearTimeout(timer);
  }, [loadDashboard]);

  const handleDismissMessage = async () => {
    if (!coachMessage) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const msgId = coachMessage.id;
    setCoachMessage(null);
    try { await markMessageAsRead(msgId); } catch (e) { console.error(e); }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: '#F7FAFC' },
      headerLeft: () => (
        <View style={{ marginLeft: 4 }}>
          <Text style={styles.logoText}>Logbook<Text style={{ color: '#007AFF' }}>EdF</Text></Text>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 4 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={{ position: 'relative', padding: 4 }}>
            <Feather name="bell" size={24} color="#4A5568" />
            {unreadCount > 0 && (
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.profileButton}>
            <Feather name="user" size={20} color="#4A5568" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, unreadCount]);

  const handleStartWorkout = (plannedWorkoutId?: string) => {
    navigation.navigate('LogWorkout', { templateId: plannedWorkoutId });
  };

  const handleLockedPlan = (reason: 'future' | 'expired') => {
    const msg = reason === 'future'
      ? 'Este plano de treino ainda não começou. Aguarde a data de início.'
      : 'A vigência deste plano encerrou. Entre em contato com seu treinador para renovar.';
    Alert.alert('Acesso Bloqueado', msg, [{ text: 'Entendi' }]);
  };

  const isFreeWorkoutOpen = currentSession && !currentSession.template_id && !currentSession.planned_workout_id;

  let planStatus: 'active' | 'future' | 'expired' = 'active';
  if (activePlan) {
    planStatus = checkPlanValidity(activePlan.program.starts_at, activePlan.program.expires_at);
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: 80 + insets.bottom, paddingTop: 10 + insets.top }]}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="dark-content" />

      <View style={styles.greetingSection}>
        <View>
          <Text style={styles.greetingText}>Olá, {displayName || 'Atleta'} 👋</Text>
          <Text style={styles.subGreeting}>{HOME_MESSAGE || "Vamos evoluir hoje?"}</Text>
        </View>
      </View>

      <CoachFeedbackBanner message={coachMessage} onDismiss={handleDismissMessage} />
      <WeeklyTracker workoutDays={weekDays.workoutDays} cardioDays={weekDays.cardioDays} />

      {hasTodayCardio && (
        <View style={styles.cardioBadge}>
          <LinearGradient colors={['#FC4C02', '#E24301']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardioGradient}>
            <Feather name="zap" size={14} color="#FFF" />
            <Text style={styles.cardioText}>Cardio de hoje registrado!</Text>
          </LinearGradient>
        </View>
      )}

      {/* --- PLANO ATIVO --- */}
      {!loadingPlan && activePlan && (
        <View style={styles.sectionCompact}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderSmall}>Seu Plano</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.planNameSmall}>{activePlan.program.name}</Text>
              {planStatus !== 'active' && <Feather name="lock" size={12} color="#E53E3E" />}
            </View>
          </View>

          {planStatus === 'active' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsScrollCompact}>
              {activePlan.workouts.map((workout, index) => {
                const isOpen = currentSession?.planned_workout_id === workout.id;
                const gradients = [['#007AFF', '#0056b3'], ['#38A169', '#276749'], ['#805AD5', '#553C9A'], ['#D69E2E', '#975A16']];
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
          ) : (
            <TouchableOpacity
              style={styles.lockedCard}
              onPress={() => handleLockedPlan(planStatus)}
              activeOpacity={0.8}
            >
              <Feather name="lock" size={32} color="#E53E3E" />
              <Text style={styles.lockedTitle}>
                {planStatus === 'expired' ? 'Plano Expirado' : 'Em Breve'}
              </Text>
              <Text style={styles.lockedSub}>
                {planStatus === 'expired' ? 'Contate seu treinador para renovar.' : `Inicia em ${new Date(activePlan.program.starts_at!).toLocaleDateString()}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* --- GRID DE AÇÃO --- */}
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
              <Text style={[styles.cardButtonTitle, isFreeWorkoutOpen ? { color: '#FFF' } : { color: '#D97706' }]}>
                {isFreeWorkoutOpen ? 'Retomar' : 'Treino Livre'}
              </Text>
              <Text style={[styles.cardButtonSub, isFreeWorkoutOpen ? { color: 'rgba(255,255,255,0.8)' } : { color: '#B7791F' }]}>
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

      <TutorialModal
        tutorialKey="home_screen"
        title="Bem-vindo ao Logbook!"
        description="Esta é sua tela principal. Aqui você vê seu resumo da semana, avisos do treinador e os atalhos para começar um treino."
        icon="home-outline"
      />

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

  lockedCard: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  lockedTitle: { fontSize: 16, fontWeight: '700', color: '#C53030' },
  lockedSub: { fontSize: 12, color: '#E53E3E', textAlign: 'center' },

  menuGrid: { gap: 10, marginBottom: 20 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridRowSmall: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cardButton: { flex: 1, backgroundColor: '#FFF', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', minHeight: 100, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 },
  freeWorkoutNormal: { backgroundColor: '#FFFAF0', borderColor: '#FBD38D' },
  freeWorkoutActive: { backgroundColor: '#C05621', borderColor: '#C05621' },
  cardButtonTitle: { fontSize: 14, fontWeight: '700', color: '#2D3748', marginBottom: 1 },
  cardButtonSub: { fontSize: 11, color: '#A0AEC0' },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  smallButton: { flex: 1, backgroundColor: '#F7FAFC', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', gap: 6 },
  smallButtonText: { fontSize: 11, fontWeight: '600', color: '#4A5568' },
  badgeContainer: { position: 'absolute', top: 0, right: 0, backgroundColor: '#E53E3E', borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#F7FAFC' },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  cardioBadge: { marginBottom: 20 },
  cardioGradient: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, alignSelf: 'flex-start' },
  cardioText: { color: '#FFF', fontSize: 12, fontWeight: '700' }
});