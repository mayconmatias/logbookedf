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

import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';
import { Program } from '@/types/coaching';
import { 
  createProgram, 
  setProgramActive, 
  renameProgram, 
  deleteProgram 
} from '@/services/program.service';

type Props = NativeStackScreenProps<RootStackParamList, 'MyPrograms'>;

export default function MyPrograms({ navigation }: Props) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMyPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPrograms(data || []);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyPrograms();
    }, [loadMyPrograms])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() =>
            Alert.alert(
              'Ajuda',
              'Segure o dedo sobre um programa para ver opções como: Ativar, Renomear ou Excluir.'
            )
          }
        >
          <Feather name="help-circle" size={24} color="#007AFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // --- AÇÕES ---

  const handleCreateProgram = () => {
    Alert.prompt(
      'Novo Programa',
      `Dê um nome (ex: Hipertrofia A):`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Criar',
          onPress: async (name?: string) => {
            if (!name) return;
            try {
              setLoading(true);
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              await createProgram(user.id, name);
              Alert.alert('Sucesso', 'Programa criado! Toque nele para adicionar os treinos.');
              loadMyPrograms();
            } catch (e: any) {
              if (e.message && (e.message.includes('policy') || e.code === '42501')) {
                Alert.alert('Limite Atingido', 'No plano gratuito, o limite é de 1 programa autoral.');
              } else {
                Alert.alert('Erro', e.message);
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleActivate = async (program: Program) => {
    try {
      setLoading(true);
      await setProgramActive(program.id);
      Alert.alert('Sucesso', `"${program.name}" agora é seu treino ativo na Home.`);
      loadMyPrograms();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
      setLoading(false);
    }
  };

  const handleRename = (program: Program) => {
    Alert.prompt(
      'Renomear Programa',
      'Digite o novo nome:',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salvar',
          onPress: async (newName?: string) => {
            if (!newName || newName.trim() === '') return;
            try {
              setLoading(true);
              await renameProgram(program.id, newName);
              loadMyPrograms();
            } catch (e: any) {
              Alert.alert('Erro', e.message);
              setLoading(false);
            }
          }
        }
      ],
      'plain-text',
      program.name
    );
  };

  const handleDelete = (program: Program) => {
    Alert.alert(
      'Excluir Programa',
      `Tem certeza que deseja apagar "${program.name}" e todos os treinos dentro dele?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteProgram(program.id);
              loadMyPrograms();
            } catch (e: any) {
              Alert.alert('Erro', e.message);
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Menu de Opções (Substitui o toggle direto)
  const handleLongPress = (program: Program) => {
    Alert.alert(
      program.name,
      'Escolha uma opção:',
      [
        { 
          text: program.is_active ? 'Já está Ativo' : 'Tornar Ativo na Home', 
          onPress: () => !program.is_active && handleActivate(program),
          style: 'default'
        },
        { text: 'Renomear', onPress: () => handleRename(program) },
        { text: 'Excluir', onPress: () => handleDelete(program), style: 'destructive' },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  const renderItem = ({ item }: { item: Program }) => (
    <TouchableOpacity
      style={[styles.card, item.is_active && styles.activeCard]}
      onPress={() => navigation.navigate('CoachProgramDetails', { program: item })}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={300}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Feather
            name={item.is_active ? 'check-circle' : 'folder'}
            size={20}
            color={item.is_active ? '#007AFF' : '#718096'}
          />
          <Text 
            style={[styles.programName, item.is_active && styles.activeText]} 
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </View>
        {item.is_active && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ATIVO</Text>
          </View>
        )}
      </View>
      
      <View style={styles.footerRow}>
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleDateString('pt-BR')}
        </Text>
        
        {item.origin_template_id ? (
          <Text style={styles.originTag}>Comprado na Loja</Text>
        ) : (
          <Text style={styles.selfTag}>Autoral</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#007AFF" />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="clipboard" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Nenhum programa encontrado.</Text>
              <Text style={styles.emptySubText}>
                Crie seu próprio treino ou adquira um na loja.
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleCreateProgram}>
        <Feather name="plus" size={24} color="#FFF" />
        <Text style={styles.fabText}>Criar Programa</Text>
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
  activeCard: { borderColor: '#007AFF', backgroundColor: '#F0F9FF' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  programName: { fontSize: 16, fontWeight: '700', color: '#2D3748', flex: 1, marginRight: 8 },
  activeText: { color: '#007AFF' },
  badge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginLeft: 28 
  },
  date: { fontSize: 12, color: '#718096' },
  originTag: { fontSize: 12, color: '#805AD5', fontWeight: '600' },
  selfTag: { fontSize: 12, color: '#38A169', fontStyle: 'italic' },

  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4A5568',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#718096',
    marginTop: 8,
    textAlign: 'center',
  },

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