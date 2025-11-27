import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import t from '@/i18n/pt';
import { WorkoutSet, HistoricalSet } from '@/types/workout';
import { calculateE1RM } from '@/utils/e1rm';
import { getDaysAgo } from '@/utils/date';
import { fetchPreviousBestSet } from '@/services/progression.service';
import SetShareCard from './SetShareCard';

type PRKind = 'e1rm' | 'reps' | 'none';

interface SetShareModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  set: WorkoutSet | null;
  definitionId: string | null;
  isPR: boolean;
}

export default function SetShareModal({
  visible,
  onClose,
  exerciseName,
  set,
  definitionId,
  isPR,
}: SetShareModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [bgOpacity, setBgOpacity] = useState<number>(1);
  const [previousBest, setPreviousBest] = useState<HistoricalSet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSharingOrSaving, setIsSharingOrSaving] = useState<boolean>(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const insets = useSafeAreaInsets();

  // Carrega PR anterior quando modal abre
  useEffect(() => {
    if (visible && set && definitionId) {
      setLoading(true);

      const loadPrevious = async () => {
        try {
          if (isPR) {
            // [CORREÇÃO] Passamos o ID da sessão atual para excluir da busca
            // Se set.sessionWorkoutId estiver undefined, a query vai buscar tudo (o que causa o bug),
            // mas como corrigimos o LogWorkout para passar isso, deve funcionar.
            const data = await fetchPreviousBestSet(definitionId, set.sessionWorkoutId);
            setPreviousBest(data);
          } else {
            setPreviousBest(null);
          }
        } catch (error: any) {
          console.error('Erro ao buscar PR anterior:', error);
          Alert.alert(
            t.common.error,
            error?.message || 'Erro ao buscar recorde anterior.'
          );
        } finally {
          setLoading(false);
        }
      };

      loadPrevious();
    } else if (visible) {
      setLoading(false);
      setPreviousBest(null);
    }
  }, [visible, set, definitionId, isPR]);

  const currentSetData: HistoricalSet | null = useMemo(() => {
    if (!set) return null;

    return {
      date: new Date().toISOString(),
      weight: set.weight,
      reps: set.reps,
      e1rm: calculateE1RM(set.weight, set.reps),
    };
  }, [set]);

  const prKind: PRKind = useMemo(() => {
    if (!isPR || !currentSetData) return 'none';
    if (!previousBest) return 'e1rm';

    const currE1 =
      currentSetData.e1rm ??
      calculateE1RM(currentSetData.weight, currentSetData.reps);
    const prevE1 =
      previousBest.e1rm ??
      calculateE1RM(previousBest.weight, previousBest.reps);
    const epsilon = 0.5;

    if (currE1 > prevE1 + epsilon) {
      return 'e1rm';
    }

    if (
      currentSetData.weight === previousBest.weight &&
      currentSetData.reps > previousBest.reps
    ) {
      return 'reps';
    }

    return 'none';
  }, [isPR, currentSetData, previousBest]);

  const handleShare = async () => {
    if (!currentSetData) return;
    if (!viewShotRef.current) return;

    try {
      setIsSharingOrSaving(true);
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.9 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar série' });
    } catch (error: any) {
      Alert.alert('Erro', error?.message);
    } finally {
      setIsSharingOrSaving(false);
    }
  };

  const handleSave = async () => {
    if (!viewShotRef.current) return;
    try {
      setIsSharingOrSaving(true);
      if (!permissionResponse || permissionResponse.status !== 'granted') {
        const permission = await requestPermission();
        if (!permission.granted) {
          Alert.alert('Permissão', 'Preciso de acesso à galeria.');
          setIsSharingOrSaving(false);
          return;
        }
      }
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.9 });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Sucesso', 'Salvo na galeria.');
    } catch (error: any) {
      Alert.alert('Erro', error?.message);
    } finally {
      setIsSharingOrSaving(false);
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
      {/* View simples para o fundo escuro */}
      <View style={styles.modalContainer}>
        
        {/* Botão de Fechar no Topo Esquerdo (Com Safe Area) */}
        <View style={[styles.topHeader, { marginTop: insets.top > 0 ? insets.top : 20 }]}>
           <TouchableOpacity style={styles.closeButtonTop} onPress={onClose}>
              <Feather name="x" size={24} color="#FFF" />
           </TouchableOpacity>
        </View>

        {/* Área Central de Preview */}
        <View style={styles.previewArea}>
          {loading || !currentSetData ? (
            <ActivityIndicator size="large" color="#FFFFFF" />
          ) : (
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.9 }}>
              <SetShareCard
                exerciseName={exerciseName}
                set={currentSetData}
                previousSet={previousBest}
                isPR={isPR}
                getDaysAgo={getDaysAgo}
                prKind={prKind}
                bgOpacity={bgOpacity}
              />
            </ViewShot>
          )}
        </View>

        {/* Controles no Rodapé */}
        {!loading && (
          <View style={styles.controlsArea}>
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>Transparência</Text>
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
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={handleSave} disabled={isSharingOrSaving}>
                <Feather name="download" size={16} color="#fff" />
                <Text style={styles.modalButtonText}>Salvar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonShare]} onPress={handleShare} disabled={isSharingOrSaving}>
                <Feather name="share" size={16} color="#fff" />
                <Text style={styles.modalButtonText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)', 
    justifyContent: 'space-between', // Distribui Header, Content, Footer
  },
  topHeader: {
    paddingHorizontal: 20,
    paddingBottom: 10, 
    alignItems: 'flex-start',
    zIndex: 10,
  },
  closeButtonTop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  controlsArea: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 40, 
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    minWidth: 100,
    justifyContent: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#4A5568',
  },
  modalButtonShare: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});