import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';
import { validateCPF } from '@/utils/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!validateCPF(cpf)) {
      return Alert.alert('Erro', 'CPF inválido.');
    }

    setLoading(true);
    try {
      // 1. Busca o e-mail pelo CPF usando a RPC existente
      const { data: email, error: rpcError } = await supabase.rpc('get_email_by_cpf', { p_cpf: cpf });
      
      if (rpcError) throw rpcError;
      if (!email) throw new Error('CPF não encontrado.');

      // 2. Dispara o e-mail de reset
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email as string, {
        redirectTo: 'logbookedf://reset-password',
      });

      if (resetError) throw resetError;

      Alert.alert(
        'E-mail enviado!',
        'Verifique sua caixa de entrada (e spam). Clique no link enviado para redefinir sua senha.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );

    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recuperar Senha</Text>
      <Text style={styles.subtitle}>
        Digite seu CPF. Enviaremos um link de redefinição para o e-mail cadastrado.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="CPF (apenas números)"
        keyboardType="number-pad"
        value={cpf}
        onChangeText={setCpf}
      />

      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleReset}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Enviar Link</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backText}>Voltar para Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#FFF' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#1A202C', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#718096', marginBottom: 30, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20 },
  button: { backgroundColor: '#007AFF', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#A0AEC0' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  backButton: { marginTop: 20, alignItems: 'center' },
  backText: { color: '#007AFF', fontSize: 16 },
});