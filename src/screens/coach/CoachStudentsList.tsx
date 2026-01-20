import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { RootStackParamList } from '@/types/navigation';
import { fetchMyStudents, inviteStudentByEmail } from '@/services/coaching.service';
import { CoachingRelationship } from '@/types/coaching';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachStudentsList'>;

// Função auxiliar para calcular a cor do status
const getStatusColor = (lastDate: string | null | undefined) => {
  if (!lastDate) return '#CBD5E0'; // Cinza (Nunca treinou)
  
  const today = new Date();
  const last = new Date(lastDate);
  const diffTime = Math.abs(today.getTime() - last.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  if (diffDays <= 3) return '#38A169'; // Verde (Ativo - até 3 dias)
  if (diffDays <= 7) return '#ECC94B'; // Amarelo (Atenção - até 1 semana)
  return '#E53E3E'; // Vermelho (Inativo - mais de 1 semana)
};

export default function CoachStudentsList({ navigation }: Props) {
  const [students, setStudents] = useState<CoachingRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados do Modal de Convite
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchMyStudents();
      setStudents(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = () => {
    setEmailInput('');
    setIsModalVisible(true);
  };

  const handleInvite = async () => {
    if (!emailInput) return;
    
    setInviting(true);
    try {
      // Chama o serviço inteligente (vincula direto ou manda e-mail)
      const result = await inviteStudentByEmail(emailInput);
      
      Alert.alert('Sucesso', result.message);
      setIsModalVisible(false);
      
      // Se o aluno já existia e foi vinculado agora ('linked'), recarrega a lista.
      // Se foi enviado convite ('invited'), não precisa recarregar pois ele ainda não aceitou.
      if (result.status === 'linked') {
        setLoading(true);
        loadData(); 
      }
    } catch (e: any) {
      Alert.alert('Atenção', e.message);
    } finally {
      setInviting(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Meus Alunos',
      headerRight: () => (
        <TouchableOpacity onPress={handleOpenModal} style={{ padding: 8 }}>
          <Feather name="user-plus" size={24} color="#007AFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const renderItem = ({ item }: { item: CoachingRelationship }) => {
    // @ts-ignore - last_workout_date vem do join no serviço
    const lastDate = item.last_workout_date;
    const statusColor = getStatusColor(lastDate);

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigation.navigate('CoachStudentDetails', { relationship: item })}
      >
        <View style={styles.avatarContainer}>
          <Feather name="user" size={24} color="#555" />
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.name}>{item.student?.display_name || 'Sem nome'}</Text>
          <Text style={styles.email} numberOfLines={1}>
            {lastDate 
              ? `Último treino: ${new Date(lastDate).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}` 
              : 'Nunca treinou'}
          </Text>
        </View>
        
        {/* Semáforo de Status */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>
        
        <Feather name="chevron-right" size={20} color="#CCC" />
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={students}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="users" size={48} color="#CCC" />
            <Text style={styles.emptyText}>Você ainda não tem alunos.</Text>
            <TouchableOpacity style={styles.buttonEmpty} onPress={handleOpenModal}>
              <Text style={styles.buttonEmptyText}>Adicionar o primeiro</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      />

      {/* Modal de Convite */}
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
            <Text style={styles.modalTitle}>Novo Aluno</Text>
            <Text style={styles.modalDescription}>
              Digite o e-mail do aluno. Se ele já tiver conta, será vinculado imediatamente. Se não, receberá um convite.
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="email@exemplo.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              value={emailInput}
              onChangeText={setEmailInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setIsModalVisible(false)}
                disabled={inviting}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={handleInvite}
                disabled={inviting}
              >
                {inviting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Adicionar</Text>
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
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContainer: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#2D3748' },
  email: { fontSize: 13, color: '#718096', marginTop: 2 },
  statusContainer: { paddingHorizontal: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#718096',
    marginBottom: 24,
  },
  buttonEmpty: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonEmptyText: { color: '#FFF', fontWeight: '600' },

  // Estilos do Modal
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