import React, { useState, useEffect } from "react";
import { 
  View, Text, TextInput, Alert, StyleSheet, TouchableOpacity, 
  ActivityIndicator, KeyboardAvoidingView, Platform 
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { 
  GoogleSignin, 
  statusCodes 
} from '@react-native-google-signin/google-signin';

import type { RootStackParamList } from "@/types/navigation";
import { supabase } from "@/lib/supabaseClient";
import t from "@/i18n/pt";

// Configura o Google Sign In Nativo (Inicia uma vez fora do componente)
GoogleSignin.configure({
  scopes: ['https://www.googleapis.com/auth/userinfo.email'],
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // DO WEB, NÃO DO ANDROID
  offlineAccess: false,
});

export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Login">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // --- LOGIN GOOGLE (NATIVO & ROBUSTO) ---
  useEffect(() => {
    // Configura o Google Sign In ao montar o componente
    GoogleSignin.configure({
      scopes: ['https://www.googleapis.com/auth/userinfo.email'],
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      if (userInfo.data?.idToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        });

        if (error) throw error;
      } else {
        throw new Error('No ID token present!');
      }
    } catch (e: any) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        // Usuário cancelou
      } else if (e.code === statusCodes.IN_PROGRESS) {
        // Já está em processo
      } else if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Erro', 'Google Play Services indisponível.');
      } else {
        Alert.alert('Erro no Login Google', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN E-MAIL/SENHA ---
  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert(t.common.attention, "Por favor, preencha e-mail e senha.");
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) {
        if (error.message.includes("Invalid login")) throw new Error("E-mail ou senha incorretos.");
        throw error;
      }
    } catch (e: any) {
      Alert.alert("Atenção", e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIN APPLE ---
  const handleAppleLogin = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) throw error;
      }
    } catch (e: any) {
      if (e.code === 'ERR_CANCELED') return;
      Alert.alert('Erro Apple', e.message);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.logoText}>Logbook<Text style={{color: '#007AFF'}}>EdF</Text></Text>
        <Text style={styles.subtitle}>{t.auth.loginTitle}</Text>
      </View>
      
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor="#A0AEC0"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Sua senha"
            placeholderTextColor="#A0AEC0"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity 
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotLink}
          >
            <Text style={styles.forgotText}>Esqueceu a senha?</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={[styles.buttonPrimary, loading && styles.buttonDisabled]} 
          onPress={handleLogin} 
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonTextPrimary}>{t.auth.loginButton}</Text>}
        </TouchableOpacity>

        <View style={styles.separatorContainer}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>ou entre com</Text>
          <View style={styles.separatorLine} />
        </View>

        <View style={styles.socialRow}>
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleLogin}
            />
          )}
          
          <TouchableOpacity 
            style={styles.googleButton} 
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
             <Feather name="chrome" size={24} color="#DB4437" /> 
             <Text style={styles.socialText}>Google</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Não tem uma conta?</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
          <Text style={styles.signupText}>{t.auth.goToSignup}</Text>
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoText: { fontSize: 32, fontWeight: '900', color: '#1A202C', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#718096' },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#4A5568' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#2D3748', backgroundColor: '#F7FAFC' },
  forgotLink: { alignSelf: 'flex-end', marginTop: 4 },
  forgotText: { color: '#007AFF', fontSize: 13, fontWeight: '600' },
  buttonPrimary: { backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  buttonDisabled: { backgroundColor: '#A0AEC0', shadowOpacity: 0 },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  separatorContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  separatorText: { marginHorizontal: 12, color: '#A0AEC0', fontSize: 12 },
  socialRow: { gap: 12 },
  appleButton: { width: '100%', height: 50 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, height: 50, gap: 10, backgroundColor: '#FFF' },
  socialText: { fontSize: 16, fontWeight: '600', color: '#2D3748' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 40, gap: 6 },
  footerText: { color: '#718096', fontSize: 15 },
  signupText: { color: '#007AFF', fontSize: 15, fontWeight: 'bold' },
});