import React, { useRef, useState, useEffect } from 'react';
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
  Platform,
} from 'react-native';
// [CORREÇÃO] Usar o hook de insets para controle manual
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import Slider from '@react-native-community/slider';
import { supabase } from '@/lib/supabaseClient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import ShareableCard from './ShareableCard';
import { generateWorkoutMarkdown } from '@/utils/markdown';

import type { WorkoutHistoryItem } from '@/types/workout';
import type {
  HistoricalRepPR as RepPR,
  HistoricalWeightPR as WeightPR,
} from '@/types/workout';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const THEMES = [
  { id: 'original', colors: ['#232526', '#414345'], label: 'Original' },
  { id: 'insta_classic', colors: ['#833AB4', '#FD1D1D', '#FCB045'], label: 'Classic' },
  { id: 'purple_haze', colors: ['#4A00E0', '#8E2DE2'], label: 'Purple' },
  { id: 'sunset', colors: ['#FF512F', '#DD2476'], label: 'Sunset' },
  { id: 'blue_ocean', colors: ['#2193b0', '#6dd5ed'], label: 'Ocean' },
  { id: 'pink_dream', colors: ['#EC008C', '#FC6767'], label: 'Pink' },
];

const TEXT_COLORS = [
  { id: 'white', color: '#FFFFFF', label: 'Branco' },
  { id: 'black', color: '#000000', label: 'Preto' },
  { id: 'gold', color: '#F6E05E', label: 'Ouro' },
  { id: 'gray', color: '#A0AEC0', label: 'Cinza' },
];

const MUSIC_VISIBILITY_OPTIONS = [
  { id: 'all', label: 'Tudo', icon: 'list' },
  { id: 'prs', label: 'PRs', icon: 'award' },
  { id: 'heaviest', label: 'Pesada', icon: 'trending-up' },
  { id: 'none', label: 'Off', icon: 'slash' },
];

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
  const [bgOpacity, setBgOpacity] = useState<number>(0.5);
  const [fullScreen, setFullScreen] = useState<boolean>(false);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0].color);
  const [musicColor, setMusicColor] = useState('#1DB954');
  const [musicVisibility, setMusicVisibility] = useState<'none' | 'all' | 'prs' | 'heaviest'>('all');
  const [borderRadius, setBorderRadius] = useState<number>(20);
  const [feather, setFeather] = useState<number>(0);
  const [isSharingOrSaving, setIsSharingOrSaving] = useState(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const insets = useSafeAreaInsets();

  const HIDDEN_Y = SCREEN_HEIGHT;
  const sheetY = useSharedValue(HIDDEN_Y);
  const [sheetOpen, setSheetOpen] = useState(false);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const toggleSheet = () => {
    if (sheetOpen) {
      sheetY.value = withSpring(HIDDEN_Y);
      setSheetOpen(false);
    } else {
      sheetY.value = withSpring(SCREEN_HEIGHT * 0.25); // Abre mais para cima
      setSheetOpen(true);
    }
  };

  useEffect(() => {
    if (visible) {
      loadPreferences();
    }
  }, [visible]);

  const loadPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('share_preferences')
        .eq('id', user.id)
        .single();

      if (profile?.share_preferences) {
        const prefs = profile.share_preferences;
        if (prefs.bgOpacity !== undefined) setBgOpacity(prefs.bgOpacity);
        if (prefs.themeId) {
          const theme = THEMES.find(t => t.id === prefs.themeId);
          if (theme) setSelectedTheme(theme);
        }
        if (prefs.textColor) setTextColor(prefs.textColor);
        if (prefs.musicColor) setMusicColor(prefs.musicColor);
        if (prefs.musicVisibility) setMusicVisibility(prefs.musicVisibility);
        if (prefs.borderRadius !== undefined) setBorderRadius(prefs.borderRadius);
        if (prefs.feather !== undefined) setFeather(prefs.feather);
      }
    } catch (e) {
      console.error('Erro ao carregar preferências:', e);
    }
  };

  const savePreferences = async (newPrefs: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('share_preferences')
        .eq('id', user.id)
        .single();

      const currentPrefs = profile?.share_preferences || {};
      const updatedPrefs = { ...currentPrefs, ...newPrefs };

      await supabase
        .from('profiles')
        .update({ share_preferences: updatedPrefs })
        .eq('id', user.id);
    } catch (e) {
      console.error('Erro ao salvar preferências:', e);
    }
  };

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
        quality: 1.0,
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

  const handleSmartShare = async (platform: 'instagram' | 'tiktok') => {
    if (!ensureWorkout()) return;
    if (!viewShotRef.current) return;

    try {
      setIsSharingOrSaving(true);
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1.0,
      });

      let options: Sharing.SharingOptions = {
        mimeType: 'image/png',
        dialogTitle: `Compartilhar no ${platform}`,
      };

      if (Platform.OS === 'ios' && platform === 'instagram') {
        options.UTI = 'com.instagram.exclusivegram';
      }

      await Sharing.shareAsync(uri, options);
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Erro ao compartilhar.');
    } finally {
      setIsSharingOrSaving(false);
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

        {/* [CORREÇÃO] Alinhado à direita e com paddingTop dinâmico */}
        <View style={[styles.topHeader, { paddingTop: Math.max(insets.top, 20) }]}>
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
              musicVisibility={musicVisibility}
              textColor={textColor}
              musicColor={musicColor}
              colors={selectedTheme.colors}
              borderRadius={borderRadius}
              feather={feather}
            />
          </ViewShot>
        </View>

        {/* SOCIAL ACTION BUTTONS - Logo abaixo do card */}
        <View style={styles.socialButtonsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#333' }]}
            onPress={handleSave}
            disabled={isSharingOrSaving}
          >
            <Feather name="download" size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#007AFF' }]}
            onPress={handleShare}
            disabled={isSharingOrSaving}
          >
            <Feather name="share-2" size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#E1306C' }]}
            onPress={() => handleSmartShare('instagram')}
            disabled={isSharingOrSaving}
          >
            <Feather name="instagram" size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#000', borderWidth: 1, borderColor: '#333' }]}
            onPress={() => handleSmartShare('tiktok')}
            disabled={isSharingOrSaving}
          >
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>TikTok</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4A5568' }]} onPress={() => setFullScreen(!fullScreen)}>
            <Feather name={fullScreen ? 'minimize-2' : 'maximize-2'} size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: sheetOpen ? '#007AFF' : '#333' }]}
            onPress={toggleSheet}
          >
            <Feather name="settings" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* CUSTOMIZATION MENU - Animated Bottom View */}
        <Animated.View style={[styles.customizationSheet, containerStyle, { height: SCREEN_HEIGHT * 0.7 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Customizar Card</Text>
            <TouchableOpacity onPress={toggleSheet} style={styles.closeDoneBtn}>
              <Feather name="chevron-down" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {/* OPACITY & RADIUS (FEATHER) */}
            <View style={styles.controlsRow}>
              <View style={styles.sliderHeader}>
                <Text style={styles.label}>Opacidade</Text>
                <Text style={styles.label}>{(bgOpacity * 100).toFixed(0)}%</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={bgOpacity}
                onSlidingComplete={(v) => savePreferences({ bgOpacity: v })}
                onValueChange={setBgOpacity}
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="#4A5568"
                thumbTintColor="#FFFFFF"
              />
            </View>

            <View style={styles.controlsRow}>
              <View style={styles.sliderHeader}>
                <Text style={styles.label}>Suavizar Bordas (Feather)</Text>
                <Text style={styles.label}>{feather.toFixed(0)}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={200}
                value={feather}
                onSlidingComplete={(v) => savePreferences({ feather: v })}
                onValueChange={setFeather}
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="#4A5568"
                thumbTintColor="#FFFFFF"
              />
            </View>

            {/* THEMES */}
            <View style={styles.controlsRow}>
              <Text style={styles.label}>Tema de Fundo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {THEMES.map(theme => (
                  <TouchableOpacity
                    key={theme.id}
                    onPress={() => {
                      setSelectedTheme(theme);
                      savePreferences({ themeId: theme.id });
                    }}
                    style={[
                      styles.themeCircle,
                      { backgroundColor: theme.colors[0] },
                      selectedTheme.id === theme.id && styles.themeSelected
                    ]}
                  >
                    {selectedTheme.id === theme.id && <Feather name="check" size={14} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* TEXT COLORS */}
            <View style={styles.controlsRow}>
              <Text style={styles.label}>Cor do Texto</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TEXT_COLORS.map(tc => (
                  <TouchableOpacity
                    key={tc.id}
                    onPress={() => {
                      setTextColor(tc.color);
                      savePreferences({ textColor: tc.color });
                    }}
                    style={[
                      styles.colorOption,
                      { backgroundColor: tc.color },
                      textColor === tc.color && styles.themeSelected
                    ]}
                  >
                    {textColor === tc.color && <Feather name="check" size={14} color={tc.id === 'white' ? '#000' : '#FFF'} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* MUSIC COLORS */}
            <View style={styles.controlsRow}>
              <Text style={styles.label}>Cor da Música</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TEXT_COLORS.map(tc => (
                  <TouchableOpacity
                    key={tc.id}
                    onPress={() => {
                      setMusicColor(tc.color);
                      savePreferences({ musicColor: tc.color });
                    }}
                    style={[
                      styles.colorOption,
                      { backgroundColor: tc.color },
                      musicColor === tc.color && styles.themeSelected
                    ]}
                  >
                    {musicColor === tc.color && <Feather name="check" size={14} color={tc.id === 'white' ? '#000' : '#FFF'} />}
                  </TouchableOpacity>
                ))}
                {/* Spotify Green Option */}
                <TouchableOpacity
                  onPress={() => {
                    setMusicColor('#1DB954');
                    savePreferences({ musicColor: '#1DB954' });
                  }}
                  style={[
                    styles.colorOption,
                    { backgroundColor: '#1DB954' },
                    musicColor === '#1DB954' && styles.themeSelected
                  ]}
                >
                  {musicColor === '#1DB954' && <Feather name="check" size={14} color="#FFF" />}
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* MUSIC POLICY */}
            <View style={styles.controlsRow}>
              <Text style={styles.label}>Trilha Sonora</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.policyContainer}>
                {MUSIC_VISIBILITY_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.policyBtn,
                      musicVisibility === opt.id && styles.policyBtnActive
                    ]}
                    onPress={() => {
                      setMusicVisibility(opt.id as any);
                      savePreferences({ musicVisibility: opt.id });
                    }}
                  >
                    <Feather name={opt.icon as any} size={14} color={musicVisibility === opt.id ? '#FFF' : '#A0AEC0'} />
                    <Text style={[styles.policyBtnText, musicVisibility === opt.id && styles.policyBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        </Animated.View>
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
    zIndex: 10,
    alignItems: 'flex-end', // Alinhado à direita
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
  socialButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    // [AJUSTE] Subindo ainda mais para ficar bem próximo do card
    marginTop: -60,
    zIndex: 5,
  },
  customizationSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    paddingBottom: 40, // Espaço extra para o Home Indicator
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10, // Garante que fique por cima dos botões sociais
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sheetTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeDoneBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 200, // Aumentado para garantir que nada fique inacessível
  },
  controlsArea: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  controlsRow: {
    marginBottom: 8, // Reduzido de 12
  },
  label: {
    color: '#CCC',
    fontSize: 10, // Reduzido de 12
    marginBottom: 6, // Reduzido de 10
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  themeCircle: {
    width: 28, // Reduzido de 30
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeSelected: {
    borderColor: '#007AFF',
    transform: [{ scale: 1.1 }],
  },
  colorOption: {
    width: 28, // Reduzido de 30
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  policyContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  policyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
    marginRight: 8,
  },
  policyBtnActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  policyBtnText: {
    fontSize: 12,
    color: '#A0AEC0',
    fontWeight: '600',
  },
  policyBtnTextActive: {
    color: '#FFF',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});