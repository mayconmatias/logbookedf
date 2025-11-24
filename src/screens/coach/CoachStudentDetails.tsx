import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'; // [IMPORTANTE]

import { RootStackParamList } from '@/types/navigation';
import { Program } from '@/types/coaching';
import { WorkoutHistoryItem } from '@/types/workout';

import { fetchStudentPrograms, createProgram } from '@/services/program.service';
import { fetchStudentHistory, fetchStudentUniqueExercises } from '@/services/coaching.service';

// Componente de Analytics
import { 
  ExerciseAnalyticsSheet, 
  ExerciseAnalyticsSheetRef 
} from '@/components/ExerciseAnalyticsSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachStudentDetails'>;

function CoachStudentDetailsScreen({ navigation, route }: Props) {
  const { relationship } = route.params;
  const studentName = relationship.student?.display_name || 'Aluno';
  const studentId = relationship.student_id;

  // Controle das Abas
  const [activeTab, setActiveTab] = useState<'programs' | 'history'>('programs');

  // Dados
  const [programs, setPrograms] = useState<Program[]>([]);
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ANALYTICS ---
  const analyticsSheetRef = useRef<ExerciseAnalyticsSheetRef>(null);
  const [isAnalyticsPickerVisible, setIsAnalyticsPickerVisible] = useState(false);
  const [studentExercises, setStudentExercises] = useState<{ definition_id: string; name: string }[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'programs') {
        const data = await fetchStudentPrograms(studentId);
        setPrograms(data);
      } else {
        const data = await fetchStudentHistory(studentId);
        setHistory(data);
      }
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: studentName });
  }, [navigation, studentName]);

  const handleCreateProgram = () => {
    Alert.prompt(
      'Novo Programa',
      `Nome do bloco de treino (ex: Hipertrofia A):`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Criar',
          onPress: async (name) => {
            if (!name) return;
            try {
              setLoading(true);
              await createProgram(studentId, name);
              Alert.alert('Sucesso', 'Programa criado!');
              loadData();
            } catch (e: any) {
              Alert.alert('Erro', e.message);
              setLoading(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  // --- LÓGICA DE ANALYTICS ---
  const handleOpenAnalyticsPicker = async () => {
    setIsAnalyticsPickerVisible(true);
    setLoadingExercises(true);
    try {
      const exercises = await fetchStudentUniqueExercises(studentId);
      setStudentExercises(exercises);
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível carregar a lista de exercícios do aluno.');
      setIsAnalyticsPickerVisible(false);
    } finally {
      setLoadingExercises(false);
    }
  };

  const handleSelectExerciseForAnalytics = (defId: string, name: string) => {
    setIsAnalyticsPickerVisible(false);
    // Abre o Sheet passando o ID do Aluno para carregar os dados dele
    setTimeout(() => {
       analyticsSheetRef.current?.openSheet(defId, name, null, studentId);
    }, 500); // Pequeno delay para o modal fechar suavemente
  };

  // Filtro de busca no modal
  const filteredExercises = studentExercises.filter(ex => 
    ex.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Renderers
  const renderProgramItem = ({ item }: { item: Program }) => (
    <TouchableOpacity
      style={[styles.card, item.is_active && styles.activeCard]}
      onPress={() => navigation.navigate('CoachProgramDetails', { program: item })}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.programName, item.is_active && styles.activeText]}>
          {item.name}
        </Text>
        {item.is_active && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ATIVO</Text>
          </View>
        )}
      </View>
      <Text style={styles.date}>
        Criado em {new Date(item.created_at).toLocaleDateString('pt-BR')}
      </Text>
    </TouchableOpacity>
  );

  const renderHistoryItem = ({ item }: { item: WorkoutHistoryItem }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>{item.template_name}</Text>
        <Text style={styles.historyDate}>
          {new Date(item.workout_date).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      <View style={styles.historyBody}>
        {item.performed_data.slice(0, 5).map((ex, idx) => (
          <Text key={idx} style={styles.historyExercise} numberOfLines={1}>
            • {ex.name}: {ex.sets.length} séries
          </Text>
        ))}
        {item.performed_data.length > 5 && (
           <Text style={styles.historyMore}>...e mais {item.performed_data.length - 5}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      
      {/* Header Actions */}
      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.analyticsButton} onPress={handleOpenAnalyticsPicker}>
          <Feather name="bar-chart-2" size={20} color="#007AFF" />
          <Text style={styles.analyticsText}>Ver Progresso do Aluno</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'programs' && styles.activeTab]}
          onPress={() => setActiveTab('programs')}
        >
          <Feather name="calendar" size={16} color={activeTab === 'programs' ? '#007AFF' : '#718096'} />
          <Text style={[styles.tabText, activeTab === 'programs' && styles.activeTabText]}>
            Programas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Feather name="clock" size={16} color={activeTab === 'history' ? '#007AFF' : '#718096'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            Histórico
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#007AFF" />
      ) : (
        <>
          {activeTab === 'programs' ? (
            <FlatList
              data={programs}
              keyExtractor={(item) => item.id}
              renderItem={renderProgramItem}
              contentContainerStyle={{ paddingBottom: 80 }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Nenhum programa criado.</Text>
              }
            />
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              renderItem={renderHistoryItem}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>O aluno ainda não registrou treinos.</Text>
              }
            />
          )}
        </>
      )}

      {/* FAB */}
      {activeTab === 'programs' && (
        <TouchableOpacity style={styles.fab} onPress={handleCreateProgram}>
          <Feather name="plus" size={24} color="#FFF" />
          <Text style={styles.fabText}>Novo Programa</Text>
        </TouchableOpacity>
      )}

      {/* --- MODAL DE SELEÇÃO DE EXERCÍCIO --- */}
      <Modal
        visible={isAnalyticsPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsAnalyticsPickerVisible(false)}
      >
        <View style={styles.modalContainer}>
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

          {loadingExercises ? (
            <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#007AFF" />
          ) : (
            <FlatList
              data={filteredExercises}
              keyExtractor={(item) => item.definition_id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.pickerItem}
                  onPress={() => handleSelectExerciseForAnalytics(item.definition_id, item.name)}
                >
                  <Text style={styles.pickerItemText}>{item.name}</Text>
                  <Feather name="chevron-right" size={20} color="#CBD5E0" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                   {searchText ? 'Nenhum exercício encontrado.' : 'Este aluno ainda não registrou exercícios.'}
                </Text>
              }
            />
          )}
        </View>
      </Modal>

      {/* ANALYTICS SHEET */}
      <ExerciseAnalyticsSheet ref={analyticsSheetRef} />

    </View>
  );
}

// Wrapper para BottomSheet
export default function CoachStudentDetails(props: Props) {
  return (
    <BottomSheetModalProvider>
      <CoachStudentDetailsScreen {...props} />
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', padding: 16 },
  
  headerActions: { marginBottom: 16 },
  analyticsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EBF8FF', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BEE3F8' },
  analyticsText: { marginLeft: 8, color: '#007AFF', fontWeight: '600', fontSize: 16 },

  tabsContainer: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 8 },
  activeTab: { backgroundColor: '#EBF8FF' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#718096' },
  activeTabText: { color: '#007AFF' },

  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  activeCard: { borderColor: '#007AFF', backgroundColor: '#F0F9FF' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  programName: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  activeText: { color: '#007AFF' },
  badge: { backgroundColor: '#007AFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  date: { fontSize: 12, color: '#718096' },
  
  historyCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EDF2F7', paddingBottom: 8 },
  historyTitle: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  historyDate: { fontSize: 14, color: '#718096' },
  historyBody: { marginTop: 4 },
  historyExercise: { fontSize: 14, color: '#4A5568', marginBottom: 2 },
  historyMore: { fontSize: 12, color: '#A0AEC0', fontStyle: 'italic', marginTop: 2 },

  emptyText: { textAlign: 'center', color: '#A0AEC0', marginTop: 40 },
  
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  fabText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#F7FAFC' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  closeText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  searchInput: { margin: 16, backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EDF2F7' },
  pickerItemText: { fontSize: 16, color: '#2D3748' },
});