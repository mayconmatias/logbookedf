import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { connectStrava, syncStravaActivities } from '@/services/strava.service';

export const StravaConnect = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('strava_refresh_token')
        .eq('id', user.id)
        .single();
      setIsConnected(!!data?.strava_refresh_token);
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const success = await connectStrava();
      if (success) {
        setIsConnected(true);
        // Tenta sincronizar imediatamente após conectar
        await handleSync();
        Alert.alert('Sucesso', 'Conta Strava conectada e atividades sincronizadas!');
      } else {
        Alert.alert('Cancelado', 'A conexão não foi concluída.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const { success, count } = await syncStravaActivities();
      if (success) {
        if (count > 0) {
          Alert.alert('Sucesso', `${count} novas atividades sincronizadas!`);
        } else {
          Alert.alert('Sincronizado', 'Nenhuma atividade nova encontrada nos últimos 30 dias.');
        }
      } else {
        Alert.alert('Erro', 'Falha ao sincronizar dados do Strava. Verifique sua conexão.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert('Desconectar', 'Deseja remover a integração com Strava?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('profiles').update({
              strava_access_token: null,
              strava_refresh_token: null
            }).eq('id', user.id);
            setIsConnected(false);
          }
        }
      }
    ]);
  };

  if (loading) return <ActivityIndicator size="small" color="#FC4C02" />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="activity" size={20} color="#FC4C02" />
        <Text style={styles.title}>Integração Strava</Text>
      </View>

      {isConnected ? (
        <View style={{ gap: 8 }}>
          <View style={[styles.btn, styles.btnConnected]}>
            <Text style={styles.btnTextConnected}>Conectado</Text>
            <Feather name="check" size={16} color="#38A169" />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSync, { flex: 2 }]}
              onPress={handleSync}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Text style={styles.btnTextSync}>Sincronizar Agora</Text>
                  <Feather name="refresh-cw" size={16} color="#FFF" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnDisconnect, { flex: 1 }]}
              onPress={handleDisconnect}
            >
              <Feather name="log-out" size={16} color="#E53E3E" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.btnConnect]} onPress={handleConnect}>
          <Text style={styles.btnTextConnect}>Conectar Conta</Text>
          <Feather name="external-link" size={16} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 8, gap: 8
  },
  btnConnect: { backgroundColor: '#FC4C02' },
  btnConnected: { backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#C6F6D5' },
  btnSync: { backgroundColor: '#2B6CB0' },
  btnDisconnect: { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FED7D7' },
  btnTextConnect: { color: '#FFF', fontWeight: '700' },
  btnTextConnected: { color: '#2F855A', fontWeight: '700' },
  btnTextSync: { color: '#FFF', fontWeight: '700' }
});