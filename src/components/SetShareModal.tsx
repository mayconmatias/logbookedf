import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import Slider from '@react-native-community/slider';

import ShareableCard from './ShareableCard';
import { generateWorkoutMarkdown } from '@/utils/markdown';

import type { WorkoutHistoryItem } from '@/types/workout';
import type {
  HistoricalRepPR as RepPR,
  HistoricalWeightPR as WeightPR,
} from '@/types/workout';

// [CORREÇÃO] Dimensões dinâmicas baseadas na tela do usuário
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH; 
const CARD_HEIGHT = SCREEN_HEIGHT; 

interface WorkoutShareModalProps {
  visible: boolean;
  onClose: () => void;
  isFetchingPRs: boolean;
  workout: WorkoutHistoryItem | null;
  repPRs: RepPR[];
  weightPRs: WeightPR[];
}

export default function WorkoutShareModal({
  visible,
  onClose,
  isFetchingPRs,
  workout,
  repPRs,
  weightPRs,
}: WorkoutShareModalProps) {
  const viewShotRef = useRef<ViewShot | null>(null);
  const [bgOpacity, setBgOpacity] = useState<number>(1);
  const [fullScreen, setFullScreen] = useState<boolean>(false);
  const [isSharingOrSaving, setIsSharingOrSaving] = useState(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  const ensureWorkout = () => {
    if (!workout) {
      Alert.alert(
        'Aguarde',
        'Os dados do treino ainda não estão disponíveis.'
      );
      return false;
    }
    return true;
  };

  const handleShare = async () => {
    if (!ensureWorkout()) return;
    if (!viewShotRef.current) return;

    try {
      setIsSharingOrSaving(true);
      // Exportação em alta resolução (Full HD - 1080x1920)
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1.0,
        width: 1080,  
        height: 1920, 
      });
      
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar treino',
      });
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Erro desconhecido.');
    } finally {
      setIsSharingOrSaving(false);
    }
  };

  const handleSave = async () => {
    if (!ensureWorkout()) return;
    if (!viewShotRef.current) return;

    try {
      setIsSharingOrSaving(true);
      if (!permissionResponse || permissionResponse.status !== 'granted') {
        const permission = await requestPermission();
        if (!permission.granted) {
          Alert.alert('Permissão negada', 'Preciso de acesso à galeria.');
          setIsSharingOrSaving(false);
          return;
        }
      }
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.9,
        width: 1080,
        height: 1920,
      });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Sucesso', 'Imagem salva na galeria.');
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Erro ao salvar imagem.');
    } finally {
      setIsSharingOrSaving(false);
    }
  };

  const handleCopyText = async () => {
    if (!ensureWorkout()) return;
    try {
      const text = generateWorkoutMarkdown(workout!);
      await Clipboard.setStringAsync(text);
      Alert.alert('Copiado!', 'Texto copiado para a área de transferência.');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível copiar o texto.');
    }
  };

  const renderContent = () => {
    if (isFetchingPRs) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Carregando dados do treino...</Text>
        </View>
      );
    }

    // Área disponível para preview (acima dos controles)
    const availableHeight = SCREEN_HEIGHT * 0.65;
    // Fator de escala para caber na tela sem cortar
    const scale = Math.min(1, availableHeight / CARD_HEIGHT);

    return (
      <View style={styles.contentWrapper}>
        {/* ÁREA DE VISUALIZAÇÃO DO CARD */}
        <View style={{ 
             width: CARD_WIDTH, 
             height: CARD_HEIGHT,
             // Escala o preview para caber na tela, mas mantém a proporção original
             transform: [{ scale: fullScreen ? scale : 0.85 }], 
             alignItems: 'center',
             justifyContent: 'center',
             // Importante: overflow visible para não cortar sombras, mas hidden se vazar muito
             overflow: 'hidden',
             borderRadius: fullScreen ? 0 : 20,
          }}>
            <ViewShot
              ref={viewShotRef}
              style={{ width: '100%', height: '100%' }} 
              options={{ format: 'png', quality: 0.9 }}
            >
              <ShareableCard
                workout={workout}
                repPRs={repPRs}
                weightPRs={weightPRs}
                bgOpacity={bgOpacity}
                fullScreen={fullScreen}
              />
            </ViewShot>
        </View>

        {/* CONTROLES FIXOS NO RODAPÉ */}
        <View style={styles.controlsArea}>
          
          {/* Slider de Transparência */}
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Fundo:</Text>
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

          {/* Botões de Ação */}
          <View style={styles.scrollContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.buttonsScrollContent}
            >
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonNeutral]}
                onPress={() => setFullScreen((prev) => !prev)}
              >
                <Feather
                  name={fullScreen ? 'minimize-2' : 'maximize-2'}
                  size={16}
                  color="#FFF"
                />
                <Text style={styles.actionButtonText}>
                  {fullScreen ? 'Card' : 'Tela Cheia'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonNeutral]}
                onPress={handleCopyText}
              >
                <Feather name="copy" size={16} color="#FFF" />
                <Text style={styles.actionButtonText}>Copiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleShare}
                disabled={isSharingOrSaving}
              >
                {isSharingOrSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Feather name="share" size={16} color="#FFF" />
                    <Text style={styles.actionButtonText}>Enviar</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleSave}
                disabled={isSharingOrSaving}
              >
                {isSharingOrSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Feather name="download" size={16} color="#FFF" />
                    <Text style={styles.actionButtonText}>Baixar</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonClose]}
                onPress={onClose}
              >
                <Feather name="x" size={16} color="#333" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        {renderContent()}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)', 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center', // [CORREÇÃO] Centraliza horizontalmente o preview
    justifyContent: 'space-between', 
  },
  controlsArea: {
    width: '100%',
    paddingTop: 0,
    paddingVertical: 0, 
    paddingBottom: 40,
    zIndex: 2,
  },
  sliderRow: {
    flexDirection: 'row', 
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12, 
  },
  sliderLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
    width: 50,
  },
  slider: {
    flex: 1, 
    height: 40,
  },
  scrollContainer: {
    height: 50,
  },
  buttonsScrollContent: {
    paddingHorizontal: 16, 
    alignItems: 'center',
    gap: 10, 
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14, 
    paddingVertical: 2, 
    borderRadius: 20,
    height: 40, 
  },
  actionButtonNeutral: {
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  actionButtonClose: {
    backgroundColor: '#E5E5EA',
    width: 40, 
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 0, 
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    color: '#FFF',
  },
});