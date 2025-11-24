import { useState } from "react";
import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "@/types/navigation";
import { supabase } from "@/lib/supabaseClient";
import { validateCPF } from "@/utils/validation";
import t from "@/i18n/pt";

export default function LoginCPF({ navigation }: NativeStackScreenProps<RootStackParamList, "LoginCPF">) {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!cpf || !password) {
      return Alert.alert(t.common.attention, t.auth.validationFields);
    }
    if (!validateCPF(cpf)) {
      return Alert.alert(t.common.attention, t.auth.validationCpf);
    }
    
    try {
      setLoading(true);
      const { data: rpc, error: e1 } = await supabase.rpc("get_email_by_cpf", { p_cpf: cpf });
      if (e1) throw e1;
      const email = (rpc as string) || "";
      if (!email) throw new Error(t.auth.errorCpfNotFound);

      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2) {
        if (e2.message.includes("Email not confirmed")) {
          throw new Error(t.auth.errorEmailNotConfirmed);
        }
        throw e2;
      }
    } catch (e: any) {
      Alert.alert(t.auth.errorTitle, e.message ?? t.auth.errorLogin);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.auth.loginTitle}</Text>
      
      <TextInput
        style={styles.input}
        placeholder={t.auth.cpfPlaceholder}
        keyboardType="number-pad"
        value={cpf}
        onChangeText={setCpf}
      />
      <TextInput
        style={styles.input}
        placeholder={t.auth.passwordPlaceholder}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      
      {/* Botão Principal: ENTRAR */}
      <TouchableOpacity 
        style={[styles.buttonPrimary, loading ? styles.buttonDisabled : {}]} 
        onPress={login} 
        disabled={loading}
      >
        <Text style={styles.buttonTextPrimary}>
          {loading ? t.auth.loginButtonLoading : t.auth.loginButton}
        </Text>
      </TouchableOpacity>
      
      <View style={{ height: 12 }} />

      {/* Botão Secundário: CRIAR CONTA */}
      <TouchableOpacity 
        style={styles.buttonSecondary} 
        onPress={() => navigation.navigate("Signup")}
      >
        <Text style={styles.buttonTextSecondary}>{t.auth.goToSignup}</Text>
      </TouchableOpacity>

      {/* Link Discreto: ESQUECI A SENHA */}
      <TouchableOpacity 
        onPress={() => navigation.navigate("ForgotPassword")}
        style={styles.linkContainer}
      >
        <Text style={styles.linkText}>Esqueci minha senha</Text>
      </TouchableOpacity>

    </View>
  );
}

// Estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1A202C',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    color: '#2D3748',
    backgroundColor: '#F7FAFC',
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9',
  },
  
  // Estilos do Link de Texto
  linkContainer: {
    marginTop: 24, // Espaço maior para separar dos botões
    alignItems: 'center',
    padding: 8,
  },
  linkText: {
    color: '#718096', // Cinza discreto
    fontSize: 14,
    textDecorationLine: 'underline', // Opcional: sublinhado para indicar clique
  },
});