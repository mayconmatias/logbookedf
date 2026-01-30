import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import Slider from '@react-native-community/slider';
import { supabase } from '@/lib/supabaseClient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { WorkoutSet, HistoricalSet } from '@/types/workout';
import { calculateE1RM } from '@/utils/e1rm';
import { getDaysAgo } from '@/utils/date';
import { fetchPreviousBestSet } from '@/services/progression.service';
import SetShareCard from './SetShareCard';

type PRKind = 'e1rm' | 'reps' | 'none';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SetShareModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  set: WorkoutSet | null;
  definitionId: string | null;
  isPR: boolean;
}

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

export default function SetShareModal({
  visible,
  onClose,
  exerciseName,
  set,
  definitionId,
  isPR,
}: SetShareModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [bgOpacity, setBgOpacity] = useState<number>(0.5);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0].color);
  const [musicColor, setMusicColor] = useState('#1DB954');
  const [borderRadius, setBorderRadius] = useState<number>(20);
  const [feather, setFeather] = useState<number>(0);

  const [previousBest, setPreviousBest] = useState<HistoricalSet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSharingOrSaving, setIsSharingOrSaving] = useState<boolean>(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const insets = useSafeAreaInsets();

  const HIDDEN_Y = SCREEN_HEIGHT;
  const sheetY = useSharedValue(HIDDEN_Y);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPreferences();
    }
  }, [visible]);

  const loadPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('share_preferences').eq('id', user.id).single();
      if (profile?.share_preferences) {
        const prefs = profile.share_preferences;
        if (prefs.bgOpacity !== undefined) setBgOpacity(prefs.bgOpacity);
        if (prefs.themeId) {
          const theme = THEMES.find(t => t.id === prefs.themeId);
          if (theme) setSelectedTheme(theme);
        }
        if (prefs.textColor) setTextColor(prefs.textColor);
        if (prefs.musicColor) setMusicColor(prefs.musicColor);
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
      const { data: profile } = await supabase.from('profiles').select('share_preferences').eq('id', user.id).single();
      const currentPrefs = profile?.share_preferences || {};
      const updatedPrefs = { ...currentPrefs, ...newPrefs };
      await supabase.from('profiles').update({ share_preferences: updatedPrefs }).eq('id', user.id);
    } catch (e) {
      console.error('Erro ao salvar preferências:', e);
    }
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const toggleSheet = () => {
    if (sheetOpen) {
      sheetY.value = withSpring(HIDDEN_Y);
      setSheetOpen(false);
    } else {
      sheetY.value = withSpring(SCREEN_HEIGHT * 0.25);
      setSheetOpen(true);
    }
  };

  useEffect(() => {
    if (visible && set && definitionId) {
      setLoading(true);
      const loadPrevious = async () => {
        try {
          if (isPR) {
            const data = await fetchPreviousBestSet(definitionId, set.sessionWorkoutId);
            setPreviousBest(data as HistoricalSet | null);
          } else {
            setPreviousBest(null);
          }
        } catch (error: any) {
          console.error('Erro ao buscar PR anterior:', error);
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
    const currE1 = currentSetData.e1rm ?? calculateE1RM(currentSetData.weight, currentSetData.reps);
    const prevE1 = previousBest.e1rm ?? calculateE1RM(previousBest.weight, previousBest.reps);
    const epsilon = 0.5;
    if (currE1 > prevE1 + epsilon) return 'e1rm';
    if (currentSetData.weight === previousBest.weight && currentSetData.reps > previousBest.reps) return 'reps';
    return 'none';
  }, [isPR, currentSetData, previousBest]);

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    try {
      setIsSharingOrSaving(true);
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar' });
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setIsSharingOrSaving(false);
    }
  };

  const handleSmartShare = async (platform: 'instagram' | 'tiktok') => {
    if (!viewShotRef.current) return;
    try {
      setIsSharingOrSaving(true);
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1.0 });
      let options: Sharing.SharingOptions = { mimeType: 'image/png', dialogTitle: `Compartilhar no ${platform}` };
      if (Platform.OS === 'ios' && platform === 'instagram') options.UTI = 'com.instagram.exclusivegram';
      await Sharing.shareAsync(uri, options);
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
          Alert.alert('Permissão', 'Acesso à galeria necessário.');
          setIsSharingOrSaving(false);
          return;
        }
      }
      const uri = await captureRef(viewShotRef, { format: 'png', quality: 1.0 });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Salvo', 'Imagem salva na galeria.');
    } catch (error: any) {
      Alert.alert('Erro', error?.message);
    } finally {
      setIsSharingOrSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={[styles.headerArea, { paddingTop: Math.max(insets.top, 20) }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.contentArea}>
          {loading ? (
            <ActivityIndicator size="large" color="#FFF" />
          ) : currentSetData ? (
            <View style={styles.cardWrapper}>
              <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }}>
                <SetShareCard
                  exerciseName={exerciseName}
                  set={currentSetData}
                  previousSet={previousBest}
                  isPR={isPR}
                  getDaysAgo={getDaysAgo}
                  prKind={prKind}
                  bgOpacity={bgOpacity}
                  music={(set as any)?.music_data}
                  colors={selectedTheme.colors}
                  textColor={textColor}
                  musicColor={musicColor}
                  borderRadius={borderRadius}
                  feather={feather}
                />
              </ViewShot>
            </View>
          ) : (
            <Text style={{ color: '#FFF' }}>Erro ao carregar dados.</Text>
          )}
        </View>

        <View style={styles.socialButtonsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#333' }]} onPress={handleSave} disabled={isSharingOrSaving}>
            <Feather name="download" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#007AFF' }]} onPress={handleShare} disabled={isSharingOrSaving}>
            <Feather name="share-2" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#E1306C' }]} onPress={() => handleSmartShare('instagram')} disabled={isSharingOrSaving}>
            <Feather name="instagram" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#000', borderWidth: 1, borderColor: '#333' }]} onPress={() => handleSmartShare('tiktok')} disabled={isSharingOrSaving}>
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>TikTok</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: sheetOpen ? '#007AFF' : '#333' }]} onPress={toggleSheet}>
            <Feather name="settings" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.customizationSheet, containerStyle, { height: SCREEN_HEIGHT * 0.7 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Customizar Card</Text>
            <TouchableOpacity onPress={toggleSheet} style={styles.closeDoneBtn}>
              <Feather name="chevron-down" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
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
                minimumTrackTintColor="#FFF"
                maximumTrackTintColor="#555"
                thumbTintColor="#FFF"
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
                minimumTrackTintColor="#FFF"
                maximumTrackTintColor="#555"
                thumbTintColor="#FFF"
              />
            </View>

            <View style={styles.controlsRow}>
              <Text style={styles.label}>Tema de Fundo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {THEMES.map(theme => (
                  <TouchableOpacity
                    key={theme.id}
                    onPress={() => { setSelectedTheme(theme); savePreferences({ themeId: theme.id }); }}
                    style={[styles.themeCircle, { backgroundColor: theme.colors[0] }, selectedTheme.id === theme.id && styles.themeSelected]}
                  >
                    {selectedTheme.id === theme.id && <Feather name="check" size={14} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.controlsRow}>
              <Text style={styles.label}>Cor do Texto</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TEXT_COLORS.map(tc => (
                  <TouchableOpacity
                    key={tc.id}
                    onPress={() => { setTextColor(tc.color); savePreferences({ textColor: tc.color }); }}
                    style={[styles.colorOption, { backgroundColor: tc.color }, textColor === tc.color && styles.themeSelected]}
                  >
                    {textColor === tc.color && <Feather name="check" size={14} color={tc.id === 'white' ? '#000' : '#FFF'} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.controlsRow}>
              <Text style={styles.label}>Cor da Música</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TEXT_COLORS.map(tc => (
                  <TouchableOpacity
                    key={tc.id}
                    onPress={() => { setMusicColor(tc.color); savePreferences({ musicColor: tc.color }); }}
                    style={[styles.colorOption, { backgroundColor: tc.color }, musicColor === tc.color && styles.themeSelected]}
                  >
                    {musicColor === tc.color && <Feather name="check" size={14} color={tc.id === 'white' ? '#000' : '#FFF'} />}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => { setMusicColor('#1DB954'); savePreferences({ musicColor: '#1DB954' }); }} style={[styles.colorOption, { backgroundColor: '#1DB954' }, musicColor === '#1DB954' && styles.themeSelected]}>
                  {musicColor === '#1DB954' && <Feather name="check" size={14} color="#FFF" />}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', flexDirection: 'column' },
  headerArea: { paddingHorizontal: 16, zIndex: 10, alignItems: 'flex-end' },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  contentArea: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', paddingBottom: 60 },
  cardWrapper: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  socialButtonsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 15, backgroundColor: 'rgba(0,0,0,0.5)', marginTop: -60, zIndex: 5 },
  customizationSheet: { backgroundColor: '#111', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, paddingBottom: 40, position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  sheetTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  closeDoneBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 200 },
  controlsRow: { marginBottom: 8 },
  label: { color: '#CCC', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  themeCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  themeSelected: { borderColor: '#007AFF', transform: [{ scale: 1.1 }] },
  colorOption: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slider: { width: '100%', height: 40 },
  actionBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
});