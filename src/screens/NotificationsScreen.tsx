import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { fetchNotifications, markAsRead, NotificationItem } from '@/services/notifications.service';
import { supabase } from '@/lib/supabaseClient';
import { triggerHaptic } from '@/utils/haptics'; // Opcional: Feedback tátil ao receber

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen({ navigation }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Pega o ID do usuário ao montar
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch (e) {
      console.log(e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // --- REALTIME SUBSCRIPTION ---
  useEffect(() => {
    const channel = supabase.channel('notifications_screen_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'coaching_messages' },
        (payload) => {
          // Só recarrega se a mensagem não for minha (for do coach)
          if (payload.new.sender_id !== currentUserId) {
            loadData(true); // Recarrega silenciosamente
            triggerHaptic('light'); 
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'exercise_messages' },
        (payload) => {
          if (payload.new.sender_id !== currentUserId) {
            loadData(true);
            triggerHaptic('light');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handlePress = async (item: NotificationItem) => {
    // 1. Marca como lida local e remotamente
    if (!item.is_read) {
      // Atualização otimista na UI
      setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
      try {
        await markAsRead(item.id, item.type);
      } catch (e) {}
    }

    // 2. Navegação Inteligente
    if (item.type === 'general') {
      // Mensagem geral -> Chat do Coach (usamos o ID da relação para abrir o modal de chat)
      // Como não temos uma "Tela de Chat Geral" dedicada na stack, podemos abrir o Profile ou um Alert por enquanto
      // Ou redirecionar para a Home que tem o banner. 
      // Idealmente: Criar uma rota 'CoachChat' ou abrir um modal aqui.
      Alert.alert(item.title, item.content); 
    
    } else if (item.type === 'exercise') {
      const exerciseName = item.title.replace('Feedback em: ', '').trim();
      
      navigation.navigate('ExerciseFeedback', {
        definitionId: item.reference_id, 
        exerciseName: exerciseName,
        userId: currentUserId 
      });
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity 
      style={[styles.card, !item.is_read && styles.unreadCard]} 
      onPress={() => handlePress(item)}
    >
      <View style={[styles.iconBox, { backgroundColor: item.type === 'general' ? '#EBF8FF' : '#F0FFF4' }]}>
        <Feather 
          name={item.type === 'general' ? 'message-square' : 'activity'} 
          size={24} 
          color={item.type === 'general' ? '#007AFF' : '#38A169'} 
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, !item.is_read && styles.unreadText]}>{item.title}</Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.content} numberOfLines={2}>{item.content}</Text>
      </View>
      {!item.is_read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color="#007AFF" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bell-off" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Nenhuma notificação.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  card: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F7FAFC', alignItems: 'center' },
  unreadCard: { backgroundColor: '#FAF5FF' }, 
  iconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '600', color: '#2D3748', flex: 1 },
  unreadText: { fontWeight: '800', color: '#000' },
  date: { fontSize: 11, color: '#A0AEC0', marginLeft: 8 },
  content: { fontSize: 14, color: '#718096' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E', marginLeft: 8 },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#A0AEC0', marginTop: 16, fontSize: 16 }
});