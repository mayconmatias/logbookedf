import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';
import t from '@/i18n/pt';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ navigation }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpdatePassword = async () => {
    // 1. Validações Locais (Antes de chamar o banco)
    if (newPassword.length < 6) {
      return Alert.alert(t.common.attention, 'A senha deve ter pelo menos 6 caracteres.');
    }

    if (newPassword !== confirmPassword) {
      return Alert.alert(t.common.attention, 'As senhas não coincidem.');
    }

    setLoading(true);
    try {
      // 2. Tenta atualizar no Supabase
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) throw error;

      // 3. SUCESSO!
      // O evento USER_UPDATED será disparado no App.tsx.
      // Como o link do email já deixou a sessão ativa, isso levará o usuário para a Home.
      
      // SE VOCÊ QUISER FORÇAR LOGIN NOVAMENTE (Segurança Extra):
      // Descomente a linha abaixo. Isso fará logout e jogará para a tela de Login.
      // await supabase.auth.signOut(); 

      Alert.alert(t.common.success, 'Sua senha foi atualizada com sucesso!');

    } catch (e: any) {
      // 4. ERRO: O usuário CONTINUA NESTA TELA para tentar de novo
      Alert.alert(t.common.error, e.message || 'Não foi possível atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    // Se o usuário desistir, precisamos fazer LOGOUT, 
    // pois o link do e-mail logou ele automaticamente.
    setLoading(true);
    await supabase.auth.signOut();
    // O App.tsx detectará SIGNED_OUT e levará para a tela de Login
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.iconContainer}>
          <Feather name="lock" size={48} color="#007AFF" />
        </View>

        <Text style={styles.title}>Nova Senha</Text>
        <Text style={styles.subtitle}>
          Crie uma senha forte para proteger sua conta.
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Nova Senha"
            placeholderTextColor="#A0AEC0"
            secureTextEntry={!showPassword}
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TouchableOpacity 
            style={styles.eyeIcon} 
            onPress={() => setShowPassword(!showPassword)}
          >
            <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#A0AEC0" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Confirme a Nova Senha"
            placeholderTextColor="#A0AEC0"
            secureTextEntry={!showPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleUpdatePassword}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Atualizar Senha</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.cancelButton} 
          onPress={handleCancel}
          disabled={loading}
        >
          <Text style={styles.cancelText}>Cancelar e Sair</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  iconContainer: {
    alignItems: 'center', marginBottom: 24, width: 80, height: 80,
    borderRadius: 40, backgroundColor: '#EBF8FF', justifyContent: 'center', alignSelf: 'center'
  },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8, color: '#1A202C', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#718096', marginBottom: 32, textAlign: 'center', lineHeight: 24 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', 
    borderRadius: 12, backgroundColor: '#F7FAFC', marginBottom: 16,
  },
  input: { flex: 1, padding: 16, fontSize: 16, color: '#2D3748' },
  eyeIcon: { padding: 16 },
  button: { 
    backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#A0AEC0', shadowOpacity: 0 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  cancelButton: { marginTop: 20, alignItems: 'center', padding: 10 },
  cancelText: { color: '#E53E3E', fontSize: 15, fontWeight: '600' }
});