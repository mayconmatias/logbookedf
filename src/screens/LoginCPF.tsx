// src/screens/LoginCPF.tsx

import { useState } from "react";
// Importe os componentes necessários
import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { supabase } from "@/lib/supabase";

export default function LoginCPF({ navigation }: NativeStackScreenProps<RootStackParamList, "LoginCPF">) {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!cpf || !password) return Alert.alert("Atenção", "Informe CPF e senha.");
    try {
      setLoading(true);
      const { data: rpc, error: e1 } = await supabase.rpc("get_email_by_cpf", { p_cpf: cpf });
      if (e1) throw e1;
      const email = (rpc as string) || "";
      if (!email) throw new Error("CPF não encontrado");

      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2) {
        if (e2.message.includes("Email not confirmed")) {
          throw new Error("Seu e-mail ainda não foi verificado. Por favor, cheque sua caixa de entrada.");
        }
        throw e2;
      }
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Entrar com CPF e senha</Text>
      <TextInput
        style={styles.input}
        placeholder="CPF (apenas números)"
        keyboardType="number-pad"
        value={cpf}
        onChangeText={setCpf}
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      
      {/* Botão "Entrar" Atualizado */}
      <TouchableOpacity 
        style={[styles.buttonPrimary, loading ? styles.buttonDisabled : {}]} 
        onPress={login} 
        disabled={loading}
      >
        <Text style={styles.buttonTextPrimary}>{loading ? "Entrando..." : "Entrar"}</Text>
      </TouchableOpacity>
      
      <View style={{ height: 12 }} />

      {/* Botão "Criar nova conta" Atualizado */}
      <TouchableOpacity 
        style={styles.buttonSecondary} 
        onPress={() => navigation.navigate("Signup")}
      >
        <Text style={styles.buttonTextSecondary}>Criar nova conta</Text>
      </TouchableOpacity>
    </View>
  );
}

// Estilos adicionados (padrão de formulário)
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
    backgroundColor: '#A9A9A9', // Cinza quando desabilitado
  }
});