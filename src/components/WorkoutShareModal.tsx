import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
// [CORREÇÃO] Usar o hook de insets para controle manual
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  
  // [CORREÇÃO] Pega as medidas seguras da tela (Notch/Ilha)
  const insets = useSafeAreaInsets();

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

    return (
      <View style={styles.contentWrapper}>
        
        {/* [CORREÇÃO] Aplicando marginTop dinâmico baseado no inset do topo */}
        <View style={[styles.topHeader, { marginTop: insets.top > 0 ? insets.top : 20 }]}>
          <TouchableOpacity
            style={styles.closeButtonTop}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.previewArea}>
          <ViewShot
            ref={viewShotRef}
            style={styles.viewShotContainer}
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

        <View style={styles.controlsArea}>
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
      {/* [CORREÇÃO] Trocado SafeAreaView por View comum para evitar conflitos de padding automático */}
      <View style={styles.modalContainer}>
        {renderContent()}
      </View>
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
  },
  topHeader: {
    width: '100%',
    paddingHorizontal: 16,
    // Padding vertical reduzido pois o marginTop já cuida do safe area
    paddingVertical: 0, 
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
    padding: 16,
  },
  viewShotContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsArea: {
    paddingHorizontal: 16,
    paddingBottom: 40, // Aumentado para garantir toque no iPhone X+
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    alignItems: 'center',
    gap: 10,
    paddingRight: 20,
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
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    color: '#FFF',
  },
});