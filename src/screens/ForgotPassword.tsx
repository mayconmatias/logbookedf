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
  Platform,
  ScrollView
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';
import t from '@/i18n/pt';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email || !email.includes('@')) {
      return Alert.alert(t.common.attention, 'Por favor, insira um e-mail válido.');
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      // Envia link de recuperação direto para o e-mail
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Ajuste esta URL para o seu Deep Link ou URL do site se usar Web
        redirectTo: 'logbookedf://reset-password',
      });

      if (error) throw error;

      Alert.alert(
        'E-mail enviado!',
        'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.',
        [{ text: 'Voltar para Login', onPress: () => navigation.navigate('Login') }]
      );

    } catch (e: any) {
      // Por segurança, não devemos dizer se o e-mail existe ou não, mas para UX mostramos erro genérico
      Alert.alert('Atenção', e.message || 'Falha ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Feather name="lock" size={48} color="#007AFF" />
        </View>

        <Text style={styles.title}>Recuperar Senha</Text>
        <Text style={styles.subtitle}>
          Digite seu e-mail cadastrado. Enviaremos um link para você criar uma nova senha.
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor="#A0AEC0"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
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
            <Text style={styles.buttonText}>Enviar Link</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => navigation.navigate('Login')} 
          style={styles.backButton}
          disabled={loading}
        >
          <Text style={styles.backText}>Voltar para Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  
  iconContainer: {
    alignItems: 'center', marginBottom: 24, width: 80, height: 80,
    borderRadius: 40, backgroundColor: '#EBF8FF', justifyContent: 'center', alignSelf: 'center'
  },
  title: { 
    fontSize: 24, fontWeight: '800', marginBottom: 12, color: '#1A202C', textAlign: 'center' 
  },
  subtitle: { 
    fontSize: 15, color: '#718096', marginBottom: 32, textAlign: 'center', lineHeight: 22 
  },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 8, marginLeft: 4 },
  input: { 
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, 
    fontSize: 16, backgroundColor: '#F7FAFC', color: '#2D3748'
  },
  button: { 
    backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center',
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
  },
  buttonDisabled: { backgroundColor: '#A0AEC0', shadowOpacity: 0 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  backButton: { marginTop: 24, alignItems: 'center', padding: 10 },
  backText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
});