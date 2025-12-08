import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { RootStackParamList } from '@/types/navigation';
import { Program, PlannedWorkout } from '@/types/coaching';
import { supabase } from '@/lib/supabaseClient';

import { 
  fetchLatestCoachMessage, 
  fetchMessageHistory, 
  sendCoachingMessage,
  CoachingMessage 
} from '@/services/coaching.service';

import { 
  ExerciseAnalyticsSheet, 
  ExerciseAnalyticsSheetRef 
} from '@/components/ExerciseAnalyticsSheet';

import t from '@/i18n/pt';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachStudentDetails'>;

const { width } = Dimensions.get('window');

// --- Componente Auxiliar: Frequência ---
const WeeklyTrackerCoach = ({ studentId }: { studentId: string }) => {
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const todayIndex = new Date().getDay();

  useFocusEffect(
    useCallback(() => {
      const loadFreq = async () => {
        const curr = new Date();
        const currentDayIndex = curr.getDay();
        const startOfWeek = new Date(curr);
        startOfWeek.setDate(curr.getDate() - currentDayIndex);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const formatLocal = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const { data } = await supabase
          .from('workouts')
          .select('workout_date')
          .eq('user_id', studentId)
          .gte('workout_date', formatLocal(startOfWeek))
          .lte('workout_date', formatLocal(endOfWeek));
        
        if (data) {
          const active = data.map(row => {
            const [y, m, d] = row.workout_date.split('-').map(Number);
            return new Date(y, m - 1, d).getDay();
          });
          setWeekDays([...new Set(active)]);
        }
      };
      loadFreq();
    }, [studentId])
  );
  
  return (
    <View style={styles.weeklyContainer}>
      <Text style={styles.sectionHeaderSmall}>Frequência da Semana</Text>
      <View style={styles.daysRow}>
        {days.map((day, index) => {
          const isToday = index === todayIndex;
          const isCompleted = weekDays.includes(index);
          return (
            <View key={index} style={styles.dayWrapper}>
              <View style={[
                styles.dayCircle, 
                isCompleted && styles.dayCompleted,
                isToday && !isCompleted && styles.dayToday
              ]}>
                {isCompleted && <Feather name="check" size={12} color="#FFF" />}
              </View>
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{day}</Text>
            </View>
          )
        })}
      </View>
    </View>
  );
};

export default function CoachStudentDetailsScreen({ navigation, route }: Props) {
  const { relationship } = route.params;
  const studentName = relationship.student?.display_name || 'Aluno';
  const studentId = relationship.student_id;

  const [activePlan, setActivePlan] = useState<{ program: Program, workouts: PlannedWorkout[] } | null>(null);
  const [workoutLastDates, setWorkoutLastDates] = useState<Record<string, string>>({}); 
  const [loading, setLoading] = useState(true);
  
  // Mensagens
  const [latestMessage, setLatestMessage] = useState<CoachingMessage | null>(null);
  const [isMessageModalVisible, setIsMessageModalVisible] = useState(false);
  const [messageHistory, setMessageHistory] = useState<CoachingMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Analytics
  const analyticsSheetRef = useRef<ExerciseAnalyticsSheetRef>(null);
  const [isAnalyticsPickerVisible, setIsAnalyticsPickerVisible] = useState(false);
  const [studentExercises, setStudentExercises] = useState<{ definition_id: string; name: string }[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // 1. Busca programa ativo
      const { data: program } = await supabase
        .from('programs')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_active', true)
        .single();
      
      if (program) {
        const { data: workouts } = await supabase
          .from('planned_workouts')
          .select('*')
          .eq('program_id', program.id)
          .order('day_order', { ascending: true });
        
        setActivePlan({ program, workouts: workouts || [] });

        // 2. Busca últimas execuções
        if (workouts && workouts.length > 0) {
           const workoutIds = workouts.map(w => w.id);
           const { data: history } = await supabase
              .from('workouts')
              .select('planned_workout_id, workout_date')
              .eq('user_id', studentId)
              .in('planned_workout_id', workoutIds)
              .not('ended_at', 'is', null)
              .order('workout_date', { ascending: false });
           
           const datesMap: Record<string, string> = {};
           history?.forEach((h: any) => {
              if (!datesMap[h.planned_workout_id]) {
                 const [y, m, d] = h.workout_date.split('-');
                 datesMap[h.planned_workout_id] = `${d}/${m}`;
              }
           });
           setWorkoutLastDates(datesMap);
        }
      } else {
        setActivePlan(null);
      }

      // 3. Busca última mensagem
      const msg = await fetchLatestCoachMessage(relationship.id);
      setLatestMessage(msg);

    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: '' }); 
  }, [navigation]);

  // --- LÓGICA DE MENSAGENS ---
  const handleOpenMessageModal = async () => {
    setIsMessageModalVisible(true);
    try {
      const history = await fetchMessageHistory(relationship.id);
      setMessageHistory(history);
    } catch (e) { console.log(e); }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    try {
      await sendCoachingMessage(relationship.id, newMessage);
      setNewMessage('');
      const history = await fetchMessageHistory(relationship.id);
      setMessageHistory(history);
      setLatestMessage(history[0]);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSendingMsg(false);
    }
  };

  // --- LÓGICA DE ANALYTICS ---
  const handleOpenAnalyticsPicker = async () => {
    setIsAnalyticsPickerVisible(true);
    setLoadingExercises(true);
    try {
      const { data } = await supabase.rpc('get_student_unique_exercises', { p_student_id: studentId });
      setStudentExercises(data || []);
    } catch (e) {
      Alert.alert('Erro', 'Falha ao carregar exercícios.');
    } finally {
      setLoadingExercises(false);
    }
  };

  const filteredExercises = studentExercises.filter(ex => 
    ex.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* HEADER DO ALUNO */}
        <View style={styles.headerSection}>
           <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{studentName.charAt(0).toUpperCase()}</Text>
           </View>
           <View>
              <Text style={styles.headerTitle}>Treino de {studentName}</Text>
              <Text style={styles.headerSubtitle}>Gestão e Prescrição</Text>
           </View>
        </View>

        {/* MURAL DE MENSAGENS */}
        <TouchableOpacity style={styles.messageBox} onPress={handleOpenMessageModal}>
           <View style={styles.messageHeader}>
              <Feather name="message-square" size={16} color="#007AFF" />
              <Text style={styles.messageTitle}>Mural de Feedback</Text>
              <Feather name="chevron-right" size={16} color="#CBD5E0" style={{marginLeft: 'auto'}} />
           </View>
           <Text style={styles.messageContent} numberOfLines={2}>
              {latestMessage ? latestMessage.content : "Nenhuma mensagem recente. Toque para escrever."}
           </Text>
           {latestMessage && (
             <Text style={styles.messageDate}>
               {new Date(latestMessage.created_at).toLocaleDateString('pt-BR')}
             </Text>
           )}
        </TouchableOpacity>

        <WeeklyTrackerCoach studentId={studentId} />

        {/* PROGRAMA ATIVO - CARROSSEL */}
        <View style={styles.sectionCompact}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderSmall}>Plano Ativo</Text>
            {activePlan && <Text style={styles.planNameSmall}>{activePlan.program.name}</Text>}
          </View>
          
          {loading ? (
            <ActivityIndicator style={{marginTop: 20}} />
          ) : activePlan && activePlan.workouts.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsScrollCompact}>
              {activePlan.workouts.map((workout, index) => {
                const gradients = [ ['#007AFF', '#0056b3'], ['#38A169', '#276749'], ['#805AD5', '#553C9A'], ['#D69E2E', '#975A16'] ];
                const currentGradient = gradients[index % gradients.length];
                const lastDate = workoutLastDates[workout.id] || "Nunca";

                return (
                  <TouchableOpacity 
                    key={workout.id} 
                    onPress={() => navigation.navigate('CoachWorkoutEditor', { workout })}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={currentGradient as any}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.workoutCardCompact}
                    >
                      <View style={styles.cardContentCompact}>
                        <View style={styles.cardInfoCompact}>
                           <Text style={styles.cardTitleCompact} numberOfLines={2}>{workout.name}</Text>
                           <Text style={styles.cardDateCompact}>Último: {lastDate}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <TouchableOpacity style={styles.emptyProgramCard} onPress={() => navigation.navigate('CoachStudentPrograms', { studentId, studentName })}> 
               <Text style={styles.emptyProgramText}>Nenhum plano ativo.</Text>
               <Text style={styles.linkText}>Ver Programas</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* GRID DE AÇÕES */}
        <View style={styles.grid}>
           <TouchableOpacity 
             style={styles.gridButton} 
             onPress={() => Alert.alert('Em breve', 'Histórico completo nesta tela.')}
           >
             <View style={[styles.iconCircle, { backgroundColor: '#E6FFFA' }]}>
               <Feather name="clock" size={24} color="#319795" />
             </View>
             <Text style={styles.gridText}>Histórico</Text>
           </TouchableOpacity>

           <TouchableOpacity 
             style={styles.gridButton}
             onPress={() => navigation.navigate('CoachStudentPrograms', { studentId, studentName })}
           >
             <View style={[styles.iconCircle, { backgroundColor: '#EBF8FF' }]}>
               <Feather name="layers" size={24} color="#007AFF" />
             </View>
             <Text style={styles.gridText}>Programas</Text>
           </TouchableOpacity>

           <TouchableOpacity 
             style={styles.gridButton}
             onPress={handleOpenAnalyticsPicker}
           >
             <View style={[styles.iconCircle, { backgroundColor: '#FAF5FF' }]}>
               <Feather name="bar-chart-2" size={24} color="#805AD5" />
             </View>
             <Text style={styles.gridText}>Estatísticas</Text>
           </TouchableOpacity>

           <TouchableOpacity 
              style={styles.gridButton}
              onPress={() => Alert.alert('Remover', 'Função de remover aluno em breve.')}
           >
             <View style={[styles.iconCircle, { backgroundColor: '#FFF5F5' }]}>
               <Feather name="user-x" size={24} color="#E53E3E" />
             </View>
             <Text style={styles.gridText}>Remover</Text>
           </TouchableOpacity>
        </View>

      </ScrollView>

      {/* --- MODAL DE MENSAGENS (CHAT) --- */}
      <Modal visible={isMessageModalVisible} animationType="slide" presentationStyle="pageSheet">
         <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.chatModalContainer}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
         >
           <View style={styles.modalHeader}>
              <View>
                 <Text style={styles.modalTitle}>Chat com {studentName}</Text>
                 <Text style={styles.modalSubtitle}>Histórico de Feedback</Text>
              </View>
              <TouchableOpacity onPress={() => setIsMessageModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={24} color="#4A5568" />
              </TouchableOpacity>
           </View>

           <FlatList
             data={messageHistory}
             inverted
             keyExtractor={item => item.id}
             contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
             renderItem={({ item }) => {
               const isMe = item.sender_id === currentUserId;
               return (
                 <View style={[
                   styles.chatBubble,
                   isMe ? styles.chatBubbleMe : styles.chatBubbleThem
                 ]}>
                    <Text style={[styles.chatText, isMe ? styles.chatTextMe : styles.chatTextThem]}>
                      {item.content}
                    </Text>
                    <Text style={[styles.chatDate, isMe ? styles.chatDateMe : styles.chatDateThem]}>
                      {new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                 </View>
               );
             }}
           />

           <View style={styles.inputArea}>
              <TextInput 
                style={styles.chatInput}
                placeholder="Escreva uma mensagem..."
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                placeholderTextColor="#A0AEC0"
              />
              <TouchableOpacity 
                style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]} 
                onPress={handleSendMessage}
                disabled={sendingMsg || !newMessage.trim()}
              >
                {sendingMsg ? <ActivityIndicator color="#FFF" size="small" /> : <Feather name="send" size={20} color="#FFF" />}
              </TouchableOpacity>
           </View>
         </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL DE EXERCÍCIOS (ANALYTICS) --- */}
      <Modal visible={isAnalyticsPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={{flex: 1, backgroundColor: '#F7FAFC'}}>
           <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Analisar Exercício</Text>
              <TouchableOpacity onPress={() => setIsAnalyticsPickerVisible(false)}>
                <Text style={styles.closeText}>Fechar</Text>
              </TouchableOpacity>
           </View>
           <TextInput 
             style={styles.searchInput}
             placeholder="Buscar exercício..."
             value={searchText}
             onChangeText={setSearchText}
           />
           {loadingExercises ? <ActivityIndicator style={{marginTop: 20}} /> : (
             <FlatList
               data={filteredExercises}
               keyExtractor={item => item.definition_id}
               renderItem={({ item }) => (
                 <TouchableOpacity 
                   style={styles.pickerItem}
                   onPress={() => {
                     setIsAnalyticsPickerVisible(false);
                     setTimeout(() => analyticsSheetRef.current?.openSheet(item.definition_id, item.name, null, studentId), 300);
                   }}
                 >
                   <Text style={styles.pickerItemText}>{item.name}</Text>
                   <Feather name="chevron-right" size={20} color="#CBD5E0" />
                 </TouchableOpacity>
               )}
             />
           )}
        </View>
      </Modal>
      
      <ExerciseAnalyticsSheet ref={analyticsSheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', paddingHorizontal: 20 },
  headerSection: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 20 },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A202C' },
  headerSubtitle: { fontSize: 14, color: '#718096' },

  messageBox: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  messageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  messageTitle: { fontSize: 14, fontWeight: '700', color: '#2D3748', textTransform: 'uppercase' },
  messageContent: { fontSize: 15, color: '#4A5568', fontStyle: 'italic', marginBottom: 4 },
  messageDate: { fontSize: 11, color: '#A0AEC0', textAlign: 'right' },

  weeklyContainer: { flexDirection: 'column', marginBottom: 20, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EDF2F7' },
  sectionHeaderSmall: { fontSize: 13, fontWeight: '700', color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dayWrapper: { alignItems: 'center', gap: 6 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EDF2F7', alignItems: 'center', justifyContent: 'center' },
  dayCompleted: { backgroundColor: '#38A169' },
  dayToday: { borderWidth: 2, borderColor: '#007AFF', backgroundColor: '#FFF' },
  dayLabel: { fontSize: 12, color: '#A0AEC0', fontWeight: '600' },
  dayLabelToday: { color: '#007AFF' },

  // Estilos do Carrossel (Igual Home)
  sectionCompact: { marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  planNameSmall: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  cardsScrollCompact: { paddingRight: 20, gap: 10 },
  workoutCardCompact: { width: 140, height: 80, borderRadius: 12, padding: 12, justifyContent: 'center' },
  cardContentCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  cardInfoCompact: { alignItems: 'center' },
  cardTitleCompact: { color: '#FFF', fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  cardDateCompact: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
  emptyProgramCard: { backgroundColor: '#EDF2F7', padding: 20, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#A0AEC0' },
  emptyProgramText: { color: '#718096', marginBottom: 4 },
  linkText: { color: '#007AFF', fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridButton: { width: (width - 52) / 2, backgroundColor: '#FFF', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#EDF2F7' },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  gridText: { fontSize: 14, fontWeight: '600', color: '#4A5568' },

  // Styles Modal Chat
  chatModalContainer: { flex: 1, backgroundColor: '#F0F2F5' }, 
  modalHeader: { 
    flexDirection: 'row', justifyContent: 'space-between', padding: 16, paddingTop: 20, 
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'center',
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 2, elevation: 2
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A202C' },
  modalSubtitle: { fontSize: 12, color: '#718096' },
  closeBtn: { padding: 8 },
  closeText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },

  chatBubble: { padding: 12, borderRadius: 16, marginBottom: 8, maxWidth: '80%' },
  chatBubbleMe: { backgroundColor: '#DCF8C6', alignSelf: 'flex-end', borderBottomRightRadius: 2 }, 
  chatBubbleThem: { backgroundColor: '#FFF', alignSelf: 'flex-start', borderBottomLeftRadius: 2 }, 
  chatText: { fontSize: 15 },
  chatTextMe: { color: '#000' },
  chatTextThem: { color: '#000' },
  
  chatDate: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  chatDateMe: { color: 'rgba(0,0,0,0.4)' },
  chatDateThem: { color: '#A0AEC0' },

  inputArea: { 
    flexDirection: 'row', padding: 10, paddingBottom: 30, 
    backgroundColor: '#FFF', alignItems: 'flex-end', borderTopWidth: 1, borderColor: '#E2E8F0' 
  },
  chatInput: { 
    flex: 1, backgroundColor: '#F7FAFC', borderRadius: 20, paddingHorizontal: 16, 
    paddingVertical: 10, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#E2E8F0' 
  },
  sendButton: { 
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#007AFF', 
    alignItems: 'center', justifyContent: 'center', marginLeft: 8, marginBottom: 2
  },
  sendButtonDisabled: { backgroundColor: '#CBD5E0' },

  // Picker Styles
  searchInput: { margin: 16, backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EDF2F7' },
  pickerItemText: { fontSize: 16, color: '#2D3748' },
});