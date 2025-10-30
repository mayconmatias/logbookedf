// src/screens/Signup.tsx

import { useState } from "react";
// Importe os componentes necessários
import { View, Text, TextInput, Button, Alert, StyleSheet, TouchableOpacity } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { supabase } from "@/lib/supabase";

export default function Signup({ navigation }: NativeStackScreenProps<RootStackParamList, "Signup">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !cpf) {
      return Alert.alert("Atenção", "Preencha todos os campos.");
    }
    
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { cpf: cpf } }
      });

      if (error) throw error;

      Alert.alert(
        "Cadastro enviado!", 
        "Enviamos um link de confirmação para o seu e-mail. Por favor, verifique sua caixa de entrada para ativar sua conta."
      );
      navigation.goBack(); 

    } catch (e: any) {
      Alert.alert("Erro no cadastro", e.message ?? "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Criar nova conta</Text>
      
      <TextInput
        style={styles.input}
        placeholder="email@exemplo.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="CPF (apenas números)"
        keyboardType="number-pad"
        value={cpf}
        onChangeText={setCpf}
      />
      <TextInput
        style={styles.input}
        placeholder="Senha (mínimo 6 caracteres)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {/* Botão "Criar conta" Atualizado */}
      <TouchableOpacity 
        style={[styles.buttonPrimary, loading ? styles.buttonDisabled : {}]} 
        onPress={handleSignup} 
        disabled={loading}
      >
        <Text style={styles.buttonTextPrimary}>{loading ? "Criando..." : "Criar conta"}</Text>
      </TouchableOpacity>
      
      <View style={{ height: 12 }} />

      {/* Botão "Já tenho conta" Atualizado */}
      <TouchableOpacity 
        style={styles.buttonSecondary} 
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonTextSecondary}>Já tenho conta</Text>
      </TouchableOpacity>
    </View>
  );
}

// Estilos (idênticos ao LoginCPF)
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
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
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
  }
});