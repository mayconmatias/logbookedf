import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,                // <--- NOVO
  TextInput,            // <--- NOVO
  KeyboardAvoidingView, // <--- NOVO
  Platform              // <--- NOVO
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { PlannedWorkout } from '@/types/coaching';
import { 
  fetchPlannedWorkouts, 
  createPlannedWorkout, 
  deletePlannedWorkout 
} from '@/services/workout_planning.service';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachProgramDetails'>;

export default function CoachProgramDetails({ navigation, route }: Props) {
  const { program } = route.params;
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DO MODAL ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadWorkouts = async () => {
    try {
      const data = await fetchPlannedWorkouts(program.id);
      setWorkouts(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkouts();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: program.name,
    });
  }, [navigation, program]);

  // Abre o modal limpo
  const handleOpenModal = () => {
    setWorkoutName('');
    setIsModalVisible(true);
  };

  // Cria de fato
  const handleCreate = async () => {
    if (!workoutName.trim()) return;
    setCreating(true);
    try {
      setLoading(true); // Mostra loading na lista atrás
      await createPlannedWorkout(program.id, workoutName, workouts.length);
      setIsModalVisible(false);
      loadWorkouts();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setCreating(false);
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Deletar', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Deletar', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deletePlannedWorkout(id);
            loadWorkouts();
          } catch (e: any) {
            Alert.alert('Erro', e.message);
          }
        } 
      }
    ]);
  };

  const renderItem = ({ item }: { item: PlannedWorkout }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('CoachWorkoutEditor', { workout: item })}
      onLongPress={() => handleDelete(item.id)}
    >
      <View style={styles.iconBox}>
        <Text style={styles.letter}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtext}>Toque para adicionar exercícios</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#CBD5E0" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.description}>
          Adicione os dias de treino para este bloco. O aluno verá estes treinos na Home.
        </Text>
      </View>

      {loading && !creating ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="calendar" size={40} color="#CBD5E0" />
              <Text style={styles.emptyText}>Nenhum dia de treino criado.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleOpenModal}>
        <Feather name="plus" size={24} color="#FFF" />
        <Text style={styles.fabText}>Adicionar Dia</Text>
      </TouchableOpacity>

      {/* --- MODAL DE CRIAÇÃO --- */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Dia de Treino</Text>
            <Text style={styles.modalDescription}>
              Ex: "Treino A - Perna" ou "Treino de Força"
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="Nome do treino..."
              placeholderTextColor="#999"
              value={workoutName}
              onChangeText={setWorkoutName}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setIsModalVisible(false)}
                disabled={creating}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Criar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', padding: 16 },
  header: { marginBottom: 16 },
  description: { color: '#718096', fontSize: 14 },
  
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  letter: { fontSize: 18, fontWeight: 'bold', color: '#007AFF' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#2D3748' },
  subtext: { fontSize: 12, color: '#A0AEC0', marginTop: 2 },
  
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#A0AEC0', marginTop: 10 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },

  // Estilos do Modal (Reaproveitados para manter padrão)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2D3748',
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 24,
    color: '#2D3748',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#EDF2F7',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#4A5568',
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});