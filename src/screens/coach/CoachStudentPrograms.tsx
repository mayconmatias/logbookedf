import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { RootStackParamList } from '@/types/navigation';
import { Program } from '@/types/coaching';
import { 
  fetchStudentPrograms, 
  createProgram, 
  setProgramActive, 
  renameProgram, 
  deleteProgram 
} from '@/services/program.service';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachStudentPrograms'>;

export default function CoachStudentPrograms({ navigation, route }: Props) {
  const { studentId, studentName } = route.params;
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Programas de ${studentName}`,
    });
  }, [navigation, studentName]);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStudentPrograms(studentId);
      setPrograms(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      loadPrograms();
    }, [loadPrograms])
  );

  // --- AÇÕES ---

  const handleCreateProgram = () => {
    Alert.prompt(
      'Novo Programa',
      'Nome do programa (ex: Hipertrofia A):',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Criar', 
          // [CORREÇÃO] Adicionado '?' em (name?: string)
          onPress: async (name?: string) => {
            if (!name || !name.trim()) return;
            setLoading(true);
            try {
              await createProgram(studentId, name);
              await loadPrograms();
            } catch (e: any) {
              Alert.alert('Erro', e.message);
              setLoading(false);
            }
          }
        }
      ],
      'plain-text'
    );
  };

  const handleOptions = (program: Program) => {
    Alert.alert(
      program.name,
      'Opções do Programa:',
      [
        { 
          text: program.is_active ? 'Já está Ativo' : 'Tornar Ativo', 
          onPress: async () => {
            if (program.is_active) return;
            setLoading(true);
            try {
              await setProgramActive(program.id);
              await loadPrograms();
              Alert.alert('Sucesso', 'Programa ativado para o aluno!');
            } catch(e: any) { 
              Alert.alert('Erro', e.message); 
              setLoading(false); 
            }
          }
        },
        { 
          text: 'Renomear', 
          onPress: () => {
             Alert.prompt('Renomear', 'Novo nome:', [
               { text: 'Cancelar', style: 'cancel' },
               // [CORREÇÃO] Adicionado '?' em (n?: string)
               { text: 'Salvar', onPress: async (n?: string) => {
                  if(!n || !n.trim()) return;
                  setLoading(true);
                  await renameProgram(program.id, n);
                  loadPrograms();
               }}
             ], 'plain-text', program.name);
          } 
        },
        { 
          text: 'Excluir', 
          style: 'destructive', 
          onPress: () => {
             Alert.alert('Tem certeza?', 'Isso apagará todos os treinos deste programa.', [
               { text: 'Cancelar', style: 'cancel' },
               { text: 'Apagar', style: 'destructive', onPress: async () => {
                  setLoading(true);
                  await deleteProgram(program.id);
                  loadPrograms();
               }}
             ]);
          } 
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#007AFF" />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="clipboard" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Este aluno não tem programas.</Text>
              <Text style={styles.emptySubText}>Crie um novo abaixo.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
                style={[styles.card, item.is_active && styles.activeCard]}
                onPress={() => navigation.navigate('CoachProgramDetails', { program: item })}
                onLongPress={() => handleOptions(item)}
                delayLongPress={300}
                activeOpacity={0.7}
            >
                <View style={styles.cardHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1}}>
                    <Feather 
                      name={item.is_active ? "check-circle" : "folder"} 
                      size={20} 
                      color={item.is_active ? "#007AFF" : "#718096"} 
                    />
                    <Text style={[styles.programName, item.is_active && { color: '#007AFF' }]}>
                        {item.name}
                    </Text>
                  </View>
                  {item.is_active && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>ATIVO</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.cardFooter}>
                  <Text style={styles.date}>
                    Criado em {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </Text>
                  <Feather name="chevron-right" size={20} color="#CBD5E0" />
                </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleCreateProgram}>
        <Feather name="plus" size={24} color="#FFF" />
        <Text style={styles.fabText}>Novo Programa</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', padding: 16 },
  
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  activeCard: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F9FF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  programName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3748',
  },
  badge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 28 
  },
  date: { fontSize: 12, color: '#718096' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#4A5568', marginTop: 16 },
  emptySubText: { fontSize: 14, color: '#718096', marginTop: 8 },

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
});