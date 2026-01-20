import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';
import { validateCPF } from '@/utils/validation';
import t from '@/i18n/pt';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    // 1. Validação local do CPF
    if (!validateCPF(cpf)) {
      return Alert.alert(t.common.attention, 'Por favor, insira um CPF válido.');
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      // 2. Busca o E-mail vinculado ao CPF (Segurança: Lógica no Banco de Dados)
      const { data: email, error: rpcError } = await supabase.rpc('get_email_by_cpf', { 
        p_cpf: cpf 
      });
      
      if (rpcError) throw rpcError;
      
      // Se não retornou e-mail, fingimos que enviou para não revelar se o CPF existe (Security by Obscurity)
      // Ou, se preferir UX explícita: throw new Error('CPF não encontrado.');
      if (!email) {
        throw new Error('CPF não encontrado na base de dados.');
      }

      // 3. Dispara o e-mail de recuperação
      // IMPORTANTE: O redirectTo aponta para a rota de Callback do seu site Next.js
      // Isso garante que o cookie de sessão seja gravado corretamente no navegador.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email as string, {
        redirectTo: 'https://logbookedf.pro/auth/callback?next=/auth/update-password',
      });

      if (resetError) throw resetError;

      Alert.alert(
        'E-mail enviado!',
        'Acesse seu e-mail e clique no link para criar uma nova senha através do nosso site seguro.',
        [{ text: 'Voltar para Login', onPress: () => navigation.goBack() }]
      );

    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro', e.message || 'Falha ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Feather name="lock" size={48} color="#007AFF" />
        </View>

        <Text style={styles.title}>Recuperar Senha</Text>
        <Text style={styles.subtitle}>
          Digite seu CPF abaixo. Enviaremos um link seguro para o seu e-mail cadastrado.
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>CPF</Text>
          <TextInput
            style={styles.input}
            placeholder="000.000.000-00"
            placeholderTextColor="#A0AEC0"
            keyboardType="number-pad"
            value={cpf}
            onChangeText={(text) => setCpf(text.replace(/[^0-9]/g, ''))} // Mantém apenas números visualmente
            maxLength={14}
          />
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Enviar Link de Recuperação</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          disabled={loading}
        >
          <Text style={styles.backText}>Voltar para Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFF' 
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignSelf: 'center'
  },
  title: { 
    fontSize: 24, 
    fontWeight: '800', 
    marginBottom: 12, 
    color: '#1A202C', 
    textAlign: 'center' 
  },
  subtitle: { 
    fontSize: 15, 
    color: '#718096', 
    marginBottom: 32, 
    textAlign: 'center',
    lineHeight: 22
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
    marginLeft: 4
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 12, 
    padding: 16, 
    fontSize: 16, 
    backgroundColor: '#F7FAFC',
    color: '#2D3748'
  },
  button: { 
    backgroundColor: '#007AFF', 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { 
    backgroundColor: '#A0AEC0',
    shadowOpacity: 0
  },
  buttonText: { 
    color: '#FFF', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  backButton: { 
    marginTop: 24, 
    alignItems: 'center',
    padding: 10
  },
  backText: { 
    color: '#007AFF', 
    fontSize: 15, 
    fontWeight: '600' 
  },
});