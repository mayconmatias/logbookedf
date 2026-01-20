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
import { checkPlanValidity } from '@/utils/date';
import { usePremiumAccess } from '@/hooks/usePremiumAccess'; // [NOVO]

type Props = NativeStackScreenProps<RootStackParamList, 'MyPrograms'>;

export default function MyPrograms({ navigation }: Props) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  // [NOVO] Hook de controle de acesso
  const { canCreateProgram } = usePremiumAccess();

  const loadMyPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('student_id', user.id)
        .eq('is_template', false) 
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
    // [NOVO] Verificação de limite antes de abrir o prompt
    // Conta apenas programas que eu criei (origin_template_id é null)
    const myCount = programs.filter(p => !p.origin_template_id).length;

    // Se o usuário não puder criar, o hook já mostra o alerta (showModal = true por padrão)
    if (!canCreateProgram(myCount)) return;

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
              // Tratamento específico se a trava do banco (SQL) for acionada
              if (e.message && (e.message.includes('LIMIT_REACHED') || e.code === 'P0001')) {
                 Alert.alert('Limite Atingido', 'Você atingiu o limite de programas gratuitos.');
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
    const validity = checkPlanValidity(program.starts_at, program.expires_at);
    if (validity !== 'active') {
        Alert.alert('Atenção', 'Você não pode ativar um programa vencido ou futuro.');
        return;
    }

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

  const handleLongPress = (program: Program) => {
    const options = [
      { text: 'Renomear', onPress: () => handleRename(program) },
      { text: 'Excluir', onPress: () => handleDelete(program), style: 'destructive' },
      { text: 'Cancelar', style: 'cancel' }
    ];

    const validity = checkPlanValidity(program.starts_at, program.expires_at);
    if (!program.is_active && validity === 'active') {
        options.unshift({ 
            text: 'Tornar Ativo na Home', 
            onPress: () => handleActivate(program),
            style: 'default'
        } as any);
    }

    Alert.alert(program.name, 'Escolha uma opção:', options as any);
  };

  const renderItem = ({ item }: { item: Program }) => {
    const validity = checkPlanValidity(item.starts_at, item.expires_at);
    const isLocked = validity !== 'active';

    const handlePress = () => {
        if (isLocked) {
            const msg = validity === 'future' 
                ? `Este programa inicia em ${new Date(item.starts_at!).toLocaleDateString()}.` 
                : 'A vigência deste programa encerrou. Contate o treinador para renovar.';
            Alert.alert('Acesso Bloqueado', msg);
            return;
        }
        navigation.navigate('CoachProgramDetails', { program: item });
    };

    return (
      <TouchableOpacity
        style={[
            styles.card, 
            item.is_active && styles.activeCard,
            isLocked && styles.lockedCard
        ]}
        onPress={handlePress}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={300}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Feather
              name={isLocked ? 'lock' : (item.is_active ? 'check-circle' : 'folder')}
              size={20}
              color={isLocked ? '#E53E3E' : (item.is_active ? '#007AFF' : '#718096')}
            />
            <Text 
              style={[
                  styles.programName, 
                  item.is_active && styles.activeText,
                  isLocked && styles.lockedText
              ]} 
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>
          
          {item.is_active && !isLocked && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ATIVO</Text>
            </View>
          )}
          
          {isLocked && (
             <View style={styles.lockedBadge}>
                <Text style={styles.lockedBadgeText}>
                    {validity === 'expired' ? 'VENCIDO' : 'FUTURO'}
                </Text>
             </View>
          )}
        </View>
        
        <View style={styles.footerRow}>
          <Text style={styles.date}>
            Criado: {new Date(item.created_at).toLocaleDateString('pt-BR')}
          </Text>
          
          {item.origin_template_id ? (
            <Text style={styles.originTag}>Comprado</Text>
          ) : (
            <Text style={styles.selfTag}>Autoral</Text>
          )}
        </View>
        
        {item.expires_at && (
            <Text style={[styles.expiryText, isLocked && { color: '#E53E3E' }]}>
                Vigência até: {new Date(item.expires_at).toLocaleDateString('pt-BR')}
            </Text>
        )}

      </TouchableOpacity>
    );
  };

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
  
  lockedCard: { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2', opacity: 0.9 },
  lockedText: { color: '#9B2C2C', textDecorationLine: 'line-through' },
  lockedBadge: { backgroundColor: '#FEB2B2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  lockedBadgeText: { color: '#C53030', fontSize: 9, fontWeight: '800' },

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
  
  expiryText: {
      fontSize: 11,
      color: '#718096',
      marginLeft: 28,
      marginTop: 4,
      fontStyle: 'italic'
  },

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