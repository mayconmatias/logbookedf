import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';
import { Program } from '@/types/coaching';
import { fetchMarketplacePrograms, acquireProgram } from '@/services/marketplace.service';

type Props = NativeStackScreenProps<RootStackParamList, 'Marketplace'>;

export default function MarketplaceScreen({ navigation }: Props) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [myProgramOrigins, setMyProgramOrigins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  // Carrega tanto a vitrine quanto a lista de "já possuídos"
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Carrega a Vitrine
      const catalogData = await fetchMarketplacePrograms();
      setPrograms(catalogData);

      // 2. Carrega o que eu já tenho (para bloquear duplicatas)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: myData } = await supabase
          .from('programs')
          .select('origin_template_id')
          .eq('student_id', user.id)
          .not('origin_template_id', 'is', null);

        if (myData) {
          const origins = new Set(myData.map((p) => p.origin_template_id as string));
          setMyProgramOrigins(origins);
        }
      }
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao carregar dados: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGetProgram = async (program: Program) => {
    Alert.alert(
      'Obter Programa',
      `Deseja adicionar "${program.name}" à sua biblioteca? Isso tornará este o seu treino ativo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Adicionar Agora',
          onPress: async () => {
            try {
              setPurchasing(true);
              await acquireProgram(program.id);

              Alert.alert('Sucesso!', 'O programa foi adicionado e ativado.', [
                {
                  text: 'Ir para Meus Programas',
                  onPress: () => navigation.navigate('MyPrograms'),
                },
              ]);
            } catch (e: any) {
              Alert.alert('Erro', e.message);
            } finally {
              setPurchasing(false);
              // Recarrega para atualizar os botões de "Adquirido"
              loadData();
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Program }) => {
    const isOwned = myProgramOrigins.has(item.id); // Verifica se já tenho

    return (
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.author}>Por: {item.author_name || 'Escola de Força'}</Text>
          <Text style={styles.description} numberOfLines={3}>
            {item.description || 'Sem descrição disponível.'}
          </Text>

          <View style={styles.priceTag}>
            <Text style={styles.priceText}>
              {item.price && item.price > 0 ? `R$ ${item.price}` : 'GRÁTIS'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.buyButton, isOwned && styles.disabledButton]}
          onPress={() => !isOwned && handleGetProgram(item)}
          disabled={purchasing || isOwned}
        >
          {isOwned ? (
            <>
              <Feather name="check" size={20} color="#FFF" />
              <Text style={styles.buyText}>Adquirido</Text>
            </>
          ) : (
            <>
              <Feather name="download" size={20} color="#FFF" />
              <Text style={styles.buyText}>Obter</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nenhum programa disponível na loja no momento.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardContent: { padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2D3748', marginBottom: 4 },
  author: { fontSize: 14, color: '#718096', marginBottom: 8, fontStyle: 'italic' },
  description: { fontSize: 14, color: '#4A5568', lineHeight: 20, marginBottom: 12 },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6FFFA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  priceText: { color: '#319795', fontWeight: 'bold', fontSize: 12 },

  buyButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 8,
  },
  disabledButton: {
    backgroundColor: '#A0AEC0', // Cinza para indicar inativo
  },
  buyText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#718096' },
});