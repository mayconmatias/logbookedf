import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
} from 'react-native';
// [CORREÇÃO] Usar insets manuais em vez de SafeAreaView wrapper
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Slider from '@react-native-community/slider';
import ProgressionShareCard from './ProgressionShareCard';
import { ChartDataPoint } from '@/types/analytics';

type SetData = {
  weight: number;
  reps: number;
  side?: string | null;
};

interface ProgressionShareModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  set: SetData | null;
  progression: ChartDataPoint[] | null;
  currentSessionTEV: number;
}

export default function ProgressionShareModal({
  visible,
  onClose,
  exerciseName,
  set,
  progression,
  currentSessionTEV,
}: ProgressionShareModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [bgOpacity, setBgOpacity] = useState<number>(1);
  const insets = useSafeAreaInsets(); // [NOVO]

  const handleShare = async () => {
    if (!set || !progression || progression.length === 0) {
      Alert.alert(
        'Aguarde',
        'Os dados da sua progressão ainda estão carregando ou não há histórico suficiente para gerar o card.'
      );
      return;
    }

    if (!viewShotRef.current) return;

    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.9,
      });

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar sua progressão',
      });
    } catch (e: any) {
      Alert.alert('Erro ao gerar imagem', e.message || 'Erro desconhecido');
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* [CORREÇÃO] Trocado SafeAreaView por View e justifyContent: space-between */}
      <View style={styles.modalContainer}>
        
        {/* HEADER (Topo Esquerdo) com margem segura manual */}
        <View style={[styles.topHeader, { marginTop: insets.top > 0 ? insets.top : 20 }]}>
           <TouchableOpacity 
              style={styles.closeButtonTop} 
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
           >
              <Feather name="x" size={24} color="#FFF" />
           </TouchableOpacity>
        </View>

        {/* Conteúdo Centralizado */}
        <View style={styles.centerContent}>
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
            <ProgressionShareCard
              exerciseName={exerciseName}
              set={set}
              progression={progression}
              bgOpacity={bgOpacity}
              currentSessionTEV={currentSessionTEV}
            />
          </ViewShot>
        </View>

        {/* Controles Inferiores */}
        <View style={styles.bottomControls}>
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Transparência do fundo</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={bgOpacity}
              onValueChange={setBgOpacity}
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="#4A5568"
              thumbTintColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonShare]}
            onPress={handleShare}
          >
            <Feather name="share" size={16} color="#fff" />
            <Text style={styles.modalButtonText}>Compartilhar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'space-between', // Distribui verticalmente
  },
  topHeader: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 0,
    alignItems: 'flex-start',
    zIndex: 10,
    height: 60, 
    justifyContent: 'center',
  },
  closeButtonTop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    paddingBottom: 40, // Espaço extra para segurança em telas curvadas
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.3)', // Fundo leve para destacar controles
    paddingTop: 20,
  },
  sliderContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  sliderLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    marginBottom: 4,
  },
  slider: {
    width: 240,
    height: 40,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    backgroundColor: '#007AFF',
  },
  modalButtonShare: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});