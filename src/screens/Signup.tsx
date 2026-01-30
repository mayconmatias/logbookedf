import React, { useState } from "react";
import { 
  View, Text, TextInput, Alert, StyleSheet, TouchableOpacity, 
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView 
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';

import type { RootStackParamList } from "@/types/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Signup({ navigation }: NativeStackScreenProps<RootStackParamList, "Signup">) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Reutiliza a config do Google (mesmas chaves do Login)
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token) handleSocialSignup('google', id_token);
    }
  }, [response]);

  const handleSocialSignup = async (provider: 'google' | 'apple', token: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithIdToken({ provider, token });
      if (error) throw error;
      // Sucesso -> App.tsx redireciona
    } catch (e: any) {
      Alert.alert("Erro Social", e.message);
      setLoading(false);
    }
  };

  const handleEmailSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      return Alert.alert("Atenção", "Preencha todos os campos.");
    }
    if (password.length < 6) return Alert.alert("Senha fraca", "Mínimo 6 caracteres.");
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() } }
      });

      if (error) throw error;

      Alert.alert(
        "Sucesso!", 
        "Verifique seu e-mail para confirmar o cadastro.",
        [{ text: "Ir para Login", onPress: () => navigation.navigate("Login") }]
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
           <Feather name="arrow-left" size={24} color="#4A5568" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Crie sua conta</Text>
          <Text style={styles.subTitle}>Junte-se ao Logbook EdF.</Text>
        </View>
        
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome Completo</Text>
            <TextInput style={styles.input} placeholder="Ex: João Silva" placeholderTextColor="#A0AEC0" value={name} onChangeText={setName} />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput style={styles.input} placeholder="seu@email.com" placeholderTextColor="#A0AEC0" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha</Text>
            <TextInput style={styles.input} placeholder="******" placeholderTextColor="#A0AEC0" secureTextEntry value={password} onChangeText={setPassword} />
          </View>

          <TouchableOpacity style={[styles.buttonPrimary, loading && styles.buttonDisabled]} onPress={handleEmailSignup} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonTextPrimary}>Cadastrar</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.separatorContainer}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>ou cadastre com</Text>
          <View style={styles.separatorLine} />
        </View>

        <View style={styles.socialRow}>
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={async () => {
                try {
                  const cred = await AppleAuthentication.signInAsync({
                    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
                  });
                  if (cred.identityToken) handleSocialSignup('apple', cred.identityToken);
                } catch (e: any) { if (e.code !== 'ERR_CANCELED') Alert.alert('Erro Apple', e.message); }
              }}
            />
          )}
          <TouchableOpacity style={styles.googleButton} onPress={() => promptAsync()} disabled={!request}>
             <Feather name="chrome" size={24} color="#DB4437" /> 
             <Text style={styles.socialText}>Google</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.footerLink} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.footerText}>Já tem conta? <Text style={styles.linkText}>Entrar</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  backBtn: { position: 'absolute', top: 60, left: 24, zIndex: 10 },
  header: { alignItems: 'center', marginBottom: 32, marginTop: 40 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A202C' },
  subTitle: { fontSize: 16, color: '#718096', marginTop: 8 },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#4A5568' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 16, color: '#2D3748', backgroundColor: '#F7FAFC' },
  buttonPrimary: { backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { backgroundColor: '#A0AEC0' },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  separatorContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  separatorText: { marginHorizontal: 12, color: '#A0AEC0', fontSize: 12 },
  socialRow: { gap: 12 },
  appleButton: { width: '100%', height: 50 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, height: 50, gap: 10, backgroundColor: '#FFF' },
  socialText: { fontSize: 16, fontWeight: '600', color: '#2D3748' },
  footerLink: { marginTop: 32, alignItems: 'center' },
  footerText: { color: '#718096', fontSize: 15 },
  linkText: { color: '#007AFF', fontWeight: 'bold' }
});