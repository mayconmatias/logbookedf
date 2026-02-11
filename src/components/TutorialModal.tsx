import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useTutorial } from '../context/TutorialContext';
import { Ionicons } from '@expo/vector-icons';

interface TutorialModalProps {
  tutorialKey: string;
  title: string;
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
  delay?: number; // Tempo para aparecer após entrar na tela
}

const { width } = Dimensions.get('window');

export const TutorialModal: React.FC<TutorialModalProps> = ({ 
  tutorialKey, 
  title, 
  description, 
  icon = 'information-circle-outline',
  delay = 500
}) => {
  const { hasSeenTutorial, markAsSeen, tutorialsActive } = useTutorial();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!tutorialsActive) return;

    // Se já viu, não faz nada
    if (hasSeenTutorial(tutorialKey)) return;

    // Se não viu, agenda o aparecimento
    const timer = setTimeout(() => {
      setVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [tutorialsActive, tutorialKey, delay]);

  const handleClose = () => {
    markAsSeen(tutorialKey);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name={icon} size={32} color="#007AFF" />
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <TouchableOpacity style={styles.button} onPress={handleClose}>
            <Text style={styles.buttonText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: width * 0.85,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  description: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    marginBottom: 24,
  },
  closeBtn: {
    padding: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  }
});
