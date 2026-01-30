// src/components/OnboardingTour.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const STEPS = [
  {
    key: 'home',
    title: 'Bem-vindo ao Logbook EdF!',
    description: 'Aqui você vê sua frequência, programas ativos e pode iniciar um "Treino Livre" rapidamente.',
    icon: 'home'
  },
  {
    key: 'log',
    title: 'Registre seu Treino',
    description: 'Use o botão de "+" para adicionar exercícios. O app calcula seu e1RM e sugere cargas.',
    icon: 'edit-2'
  },
  {
    key: 'marketplace',
    title: 'Loja & Coaches',
    description: 'Compre programas profissionais ou templates de coaches renomados.',
    icon: 'shopping-bag'
  },
  {
    key: 'music',
    title: 'Modo Vibe',
    description: 'Ao bater um PR, nós capturamos a música que estava tocando. Compartilhe nos Stories!',
    icon: 'music'
  }
];

export const OnboardingTour = ({ visible, onClose }: { visible: boolean, onClose: () => void }) => {
  const [stepIndex, setStepIndex] = useState(0);

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      finishTour();
    }
  };

  const finishTour = async () => {
    await AsyncStorage.setItem('@has_seen_onboarding_v1', 'true');
    onClose();
  };

  if (!visible) return null;

  const currentStep = STEPS[stepIndex];

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Feather name={currentStep.icon as any} size={32} color="#007AFF" />
          </View>
          
          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.desc}>{currentStep.description}</Text>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {STEPS.map((_, i) => (
                <View key={i} style={[styles.dot, i === stepIndex && styles.dotActive]} />
              ))}
            </View>
            
            <TouchableOpacity style={styles.btn} onPress={handleNext}>
              <Text style={styles.btnText}>
                {stepIndex === STEPS.length - 1 ? 'Começar' : 'Próximo'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    backgroundColor: '#FFF',
    width: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A202C',
    textAlign: 'center',
    marginBottom: 10
  },
  desc: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30
  },
  footer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dots: {
    flexDirection: 'row',
    gap: 6
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0'
  },
  dotActive: {
    backgroundColor: '#007AFF',
    width: 20
  },
  btn: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30
  },
  btnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16
  }
});