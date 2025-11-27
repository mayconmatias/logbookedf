import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';

interface BiometricGateProps {
  children: React.ReactNode;
  sessionActive: boolean; 
}

// Tempo de tolerância em segundos (ex: 60s) para não pedir senha se o app for minimizado rapidinho
const GRACE_PERIOD_MS = 6000 * 1000; 

export default function BiometricGate({ children, sessionActive }: BiometricGateProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  
  // Rastreia quando o app foi para background
  const backgroundTime = useRef<number | null>(null);

  // Verifica suporte ao montar
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (isMounted) {
        const supported = compatible && enrolled;
        setIsBiometricSupported(supported);
        
        // Se não tiver sessão ou não tiver hardware, libera
        if (!sessionActive || !supported) {
          setIsUnlocked(true);
        }
      }
    })();
    return () => { isMounted = false; };
  }, [sessionActive]);

  const authenticate = useCallback(async () => {
    if (!isBiometricSupported) return;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Logbook',
        fallbackLabel: 'Usar Senha',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsUnlocked(true);
        backgroundTime.current = null; // Reseta o timer
      }
    } catch (error) {
      console.log('Erro biometria:', error);
    }
  }, [isBiometricSupported]);

  // Monitora o estado do App (Background/Active)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (!sessionActive) return;

      if (nextAppState === 'background') {
        // App foi minimizado, marca o tempo
        backgroundTime.current = Date.now();
      } 
      else if (nextAppState === 'active') {
        // App voltou
        if (!backgroundTime.current) return; // Primeira abertura ou já estava ativo

        const timeDiff = Date.now() - backgroundTime.current;
        
        // Se passou mais tempo que o permitido, bloqueia
        if (timeDiff > GRACE_PERIOD_MS) {
          setIsUnlocked(false);
          authenticate();
        } else {
          // Se foi rápido, mantemos desbloqueado (se já estava)
          // Não faz nada
        }
      }
    });

    return () => subscription.remove();
  }, [sessionActive, authenticate]);

  // Gatilho inicial
  useEffect(() => {
    if (sessionActive && isBiometricSupported && !isUnlocked) {
      authenticate();
    }
  }, [sessionActive, isBiometricSupported, isUnlocked, authenticate]);

  // Se estiver liberado ou não houver sessão, renderiza o app
  if (isUnlocked || !sessionActive) {
    return <>{children}</>;
  }

  // TELA DE BLOQUEIO
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Feather name="lock" size={64} color="#007AFF" />
      </View>
      <Text style={styles.title}>Logbook Bloqueado</Text>
      <Text style={styles.subtitle}>Sua sessão está protegida.</Text>

      <TouchableOpacity style={styles.button} onPress={authenticate}>
        <Feather name="shield" size={24} color="#FFF" style={{marginRight: 10}} />
        <Text style={styles.buttonText}>Desbloquear</Text>
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