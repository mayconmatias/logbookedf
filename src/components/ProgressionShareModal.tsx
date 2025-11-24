import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
} from 'react-native';
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

  const handleShare = async () => {
    // Evita compartilhar card vazio ou sem histórico
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
      <View style={styles.modalContainer}>
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
          <ProgressionShareCard
            exerciseName={exerciseName}
            set={set}
            progression={progression}
            bgOpacity={bgOpacity}
            currentSessionTEV={currentSessionTEV}
          />
        </ViewShot>

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

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonShare]}
            onPress={handleShare}
          >
            <Feather name="share" size={16} color="#fff" />
            <Text style={styles.modalButtonText}>Compartilhar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonClose]}
            onPress={onClose}
          >
            <Feather name="x" size={16} color="#333" />
            <Text style={[styles.modalButtonText, { color: '#333' }]}>
              Fechar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
  },
  sliderContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
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
  modalActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#3A3A3C',
  },
  modalButtonShare: {
    backgroundColor: '#007AFF',
  },
  modalButtonClose: {
    backgroundColor: '#E5E5EA',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
