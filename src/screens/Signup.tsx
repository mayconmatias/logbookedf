import { useState } from "react";
import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "@/types/navigation";
import { supabase } from "@/lib/supabaseClient";
import { validateCPF } from "@/utils/validation"; 
import t from "@/i18n/pt"; 

export default function Signup({ navigation }: NativeStackScreenProps<RootStackParamList, "Signup">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !cpf) {
      return Alert.alert(t.common.attention, t.auth.validationFields);
    }
    if (!validateCPF(cpf)) {
      return Alert.alert(t.common.attention, t.auth.validationCpf);
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
        t.auth.signupSuccessTitle, 
        t.auth.signupSuccessBody
      );
      navigation.goBack(); 

    } catch (e: any) {
      Alert.alert(t.auth.errorSignup, e.message ?? t.auth.errorSignupMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.auth.signupTitle}</Text>
      
      <TextInput
        style={styles.input}
        placeholder={t.auth.emailPlaceholder}
        placeholderTextColor="#A0AEC0" // [CORREÇÃO]
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t.auth.cpfPlaceholder}
        placeholderTextColor="#A0AEC0" // [CORREÇÃO]
        keyboardType="number-pad"
        value={cpf}
        onChangeText={setCpf}
      />
      <TextInput
        style={styles.input}
        placeholder={t.auth.passwordMinChars}
        placeholderTextColor="#A0AEC0" // [CORREÇÃO]
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity 
        style={[styles.buttonPrimary, loading ? styles.buttonDisabled : {}]} 
        onPress={handleSignup} 
        disabled={loading}
      >
        <Text style={styles.buttonTextPrimary}>
          {loading ? t.auth.signupButtonLoading : t.auth.signupButton}
        </Text>
      </TouchableOpacity>
      
      <View style={{ height: 12 }} />

      <TouchableOpacity 
        style={styles.buttonSecondary} 
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonTextSecondary}>{t.auth.goToLogin}</Text>
      </TouchableOpacity>
    </View>
  );
}

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
    backgroundColor: '#F7FAFC', // Padronizado com Login
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