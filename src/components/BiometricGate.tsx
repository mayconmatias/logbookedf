import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

interface BiometricGateProps {
  children: React.ReactNode;
  isPro?: boolean; // Opcional: Se quiser limitar a PROs
  sessionActive: boolean; // Só pede se tiver sessão
}

export default function BiometricGate({ children, sessionActive }: BiometricGateProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasHardware, setHasHardware] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  // Verifica suporte de hardware ao montar
  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setHasHardware(compatible);
      
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricSupported(compatible && enrolled);
      
      // Se não tiver biometria configurada ou não tiver sessão, libera direto
      if (!sessionActive || (!compatible || !enrolled)) {
        setIsUnlocked(true);
      }
    })();
  }, [sessionActive]);

  // Função de Autenticar
  const authenticate = useCallback(async () => {
    if (!isBiometricSupported) return;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Logbook',
        fallbackLabel: 'Usar Senha do Celular',
        disableDeviceFallback: false, // Permite senha do celular se falhar
      });

      if (result.success) {
        setIsUnlocked(true);
      }
    } catch (error) {
      console.log('Erro biometria:', error);
    }
  }, [isBiometricSupported]);

  // Tenta autenticar assim que identifica suporte + sessão
  useEffect(() => {
    if (sessionActive && isBiometricSupported && !isUnlocked) {
      authenticate();
    }
  }, [sessionActive, isBiometricSupported, isUnlocked]);

  // Opcional: Bloquear novamente se o app for para background
  // Remova este useEffect se quiser que desbloqueie apenas 1 vez por "boot" do app
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' && sessionActive) {
        setIsUnlocked(false);
      }
      if (nextAppState === 'active' && sessionActive && !isUnlocked) {
        authenticate();
      }
    });
    return () => subscription.remove();
  }, [sessionActive, isUnlocked]);


  // SE ESTIVER DESBLOQUEADO (ou não precisar), RENDERIZA O APP
  if (isUnlocked) {
    return <>{children}</>;
  }

  // TELA DE BLOQUEIO
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Feather name="lock" size={64} color="#007AFF" />
      </View>
      <Text style={styles.title}>Logbook Bloqueado</Text>
      <Text style={styles.subtitle}>Use sua biometria para acessar seus treinos.</Text>

      <TouchableOpacity style={styles.button} onPress={authenticate}>
        <Feather name="smile" size={24} color="#FFF" style={{marginRight: 10}} />
        <Text style={styles.buttonText}>Autenticar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#EBF8FF',
    borderRadius: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 32,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});