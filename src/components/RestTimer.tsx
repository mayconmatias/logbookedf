import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  Modal,
  FlatList,
  Alert // [NOVO]
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTimer } from '@/context/TimerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerHaptic } from '@/utils/haptics';
import { navigate } from '@/utils/navigationRef'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withDelay,
  withTiming,
  interpolate
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const FAB_SIZE = 60;
const SATELLITE_SIZE = 44;
const RADIUS = 110; 
const MARGIN = 20;
const SESSION_KEY = '@sessionWorkoutId';

// Configuração Wheel Picker
const ITEM_HEIGHT = 50; 
const TIME_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * 15);

// --- COMPONENTE SATÉLITE ---
const SatelliteButton = ({ 
  index, totalItems, isOpen, onPress, onLongPress, children, isLocked, style 
}: any) => {
  const startAngle = -90; 
  const angleSpan = 100; 
  const step = totalItems > 1 ? angleSpan / (totalItems - 1) : 0;
  const angleDeg = startAngle + (index * step);
  const angleRad = angleDeg * (Math.PI / 180);

  const targetX = Math.cos(angleRad) * RADIUS;
  const targetY = Math.sin(angleRad) * RADIUS;

  const animVal = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      animVal.value = withDelay(index * 40, withSpring(1, { damping: 14, stiffness: 120 }));
    } else {
      animVal.value = withTiming(0, { duration: 200 });
    }
  }, [isOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(animVal.value, [0, 1], [0, targetX]) },
      { translateY: interpolate(animVal.value, [0, 1], [0, targetY]) },
      { scale: animVal.value },
    ],
    opacity: animVal.value,
  }));

  return (
    <Animated.View style={[styles.satelliteContainer, animatedStyle]}>
      <TouchableOpacity 
        style={[styles.satelliteBtnBase, style, isLocked && styles.satelliteLocked]} 
        onPress={onPress}
        onLongPress={isLocked ? undefined : onLongPress} 
        delayLongPress={300}
        activeOpacity={0.8}
        disabled={isLocked} 
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RestTimer() {
  const { 
    secondsRemaining, isActive, isOvertime, stopTimer, startTimer, 
    presets, activePresetIndex, selectPreset, updatePresets, isPro 
  } = useTimer();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWheelModalVisible, setIsWheelModalVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false); 
  const [selectedCustomTime, setSelectedCustomTime] = useState(60);

  const insets = useSafeAreaInsets();

  // --- GESTOS ---
  const x = useSharedValue(MARGIN);
  const y = useSharedValue(height - insets.bottom - 150);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextX.value = x.value;
      contextY.value = y.value;
    })
    .onUpdate((event) => {
      x.value = contextX.value + event.translationX;
      y.value = contextY.value + event.translationY;
    })
    .onEnd(() => {
      if (x.value < width / 2) x.value = withSpring(MARGIN);
      else x.value = withSpring(width - FAB_SIZE - MARGIN);
      
      const minY = insets.top + MARGIN;
      const maxY = height - insets.bottom - FAB_SIZE - MARGIN;
      if (y.value < minY) y.value = withSpring(minY);
      else if (y.value > maxY) y.value = withSpring(maxY);
    });

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const formatTime = (secs: number) => {
    const absSecs = Math.abs(secs);
    const m = Math.floor(absSecs / 60);
    const s = absSecs % 60;
    return `${secs <= 0 ? '+' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatLabel = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m > 0 && s > 0) return `${m}'${s}"`;
    if (m > 0) return `${m}'`;
    return `${s}"`;
  };

  const handleMainTap = () => {
    if (isOvertime) {
      setIsMinimized(false);
    } else if (isActive) {
      setIsMenuOpen(!isMenuOpen);
    } else {
      startTimer();
    }
  };

  const handleStartCustom = () => {
    const newPresets = [...presets];
    if (!newPresets.includes(selectedCustomTime)) {
        newPresets.push(selectedCustomTime);
        newPresets.sort((a, b) => a - b);
        updatePresets(newPresets);
    }
    const newIndex = newPresets.indexOf(selectedCustomTime);
    if (newIndex !== -1) selectPreset(newIndex);
    
    startTimer(selectedCustomTime);
    setIsWheelModalVisible(false);
    setIsMenuOpen(false);
  };

  const handleOpenWheelPicker = () => {
    if (!isPro) {
      setIsMenuOpen(false);
      navigate('CoachPaywall'); 
      return;
    }
    setIsMenuOpen(false);
    setIsWheelModalVisible(true);
  };

  // [NOVO] Função para Deletar Preset
  const handleDeletePreset = (secsToDelete: number) => {
    if (!isPro) return; // Segurança extra
    
    if (presets.length <= 1) {
      Alert.alert('Erro', 'Você deve manter pelo menos um tempo de descanso.');
      return;
    }

    Alert.alert(
      'Remover Tempo',
      `Deseja apagar o timer de ${formatLabel(secsToDelete)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Apagar', 
          style: 'destructive',
          onPress: () => {
            const newPresets = presets.filter(p => p !== secsToDelete);
            updatePresets(newPresets);
            triggerHaptic('success');
          }
        }
      ]
    );
  };

  const handleNextSet = async () => {
    stopTimer();
    setIsMinimized(false);
    try {
      const currentSessionId = await AsyncStorage.getItem(SESSION_KEY);
      if (currentSessionId) navigate('LogWorkout', { workoutId: currentSessionId });
      else navigate('LogWorkout');
    } catch (e) { navigate('LogWorkout'); }
  };

  const menuItems = [];

  if (isActive || isOvertime) {
    menuItems.push({
      key: 'stop',
      component: <View style={styles.stopIconWrapper}><View style={styles.stopSquare} /></View>,
      onPress: () => { stopTimer(); setIsMenuOpen(false); setIsMinimized(false); },
      isStop: true
    });
  }

  presets.forEach((secs, idx) => {
    const isLocked = !isPro && idx !== 0;
    menuItems.push({
      key: `preset-${idx}`,
      component: (
        <>
          <Text style={[styles.satelliteText, activePresetIndex === idx && { color: '#FFF', fontWeight: 'bold' }]}>{formatLabel(secs)}</Text>
          {isLocked && <Feather name="lock" size={8} color="#A0AEC0" style={styles.lockIcon} />}
        </>
      ),
      onPress: () => { 
        if (!isLocked) { selectPreset(idx); setIsMenuOpen(false); } 
        else triggerHaptic('error');
      },
      // [NOVO] Adicionado evento de Long Press
      onLongPress: !isLocked ? () => handleDeletePreset(secs) : undefined,
      isSelected: activePresetIndex === idx,
      isLocked
    });
  });

  menuItems.push({
    key: 'add-btn',
    component: <View><Feather name="edit-2" size={20} color={isPro ? "#007AFF" : "#A0AEC0"} /></View>,
    onPress: handleOpenWheelPicker,
    isAdd: true,
    isLocked: !isPro
  });

  // --- RENDERIZADORES ---

  return (
    <>
      {isMenuOpen && (
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setIsMenuOpen(false)} />
      )}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.fabContainer, fabStyle]}>
          <View style={styles.satellitesLayer}>
            {menuItems.map((item, idx) => (
              <SatelliteButton
                key={item.key}
                index={idx}
                totalItems={menuItems.length}
                isOpen={isMenuOpen}
                onPress={item.onPress}
                onLongPress={item.onLongPress} // [NOVO] Passando a prop
                isLocked={item.isLocked}
                style={[
                  styles.satelliteBtnBase,
                  item.isStop ? styles.satelliteStop : (item.isSelected ? styles.satelliteSelected : styles.satelliteNormal),
                  item.isAdd && styles.satelliteAdd,
                  item.isLocked && styles.satelliteLocked
                ]}
              >
                {item.component}
              </SatelliteButton>
            ))}
          </View>

          <TouchableOpacity 
            style={[
              styles.fab, 
              isActive ? styles.fabActive : styles.fabIdle,
              isOvertime && styles.fabOvertime,
            ]} 
            onPress={handleMainTap}
            onLongPress={() => { triggerHaptic('medium'); setIsMenuOpen(true); }}
            delayLongPress={300}
            activeOpacity={0.9}
          >
            {isActive || isOvertime ? (
              <Text style={styles.fabTimerText}>{formatTime(secondsRemaining)}</Text>
            ) : (
              <Feather name="clock" size={28} color="#FFF" />
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>

      {/* --- MODAL DE OVERTIME (Estilo Card Branco, Não Tela Vermelha) --- */}
      {isOvertime && !isMinimized && (
        <View style={styles.overtimeOverlay}>
           <View style={styles.overtimeCard}>
              
              {/* Header com Minimizar */}
              <View style={styles.overtimeHeader}>
                 <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                    <Feather name="bell" size={20} color="#E53E3E" />
                    <Text style={styles.overtimeTitle}>Descanso Finalizado</Text>
                 </View>
                 <TouchableOpacity onPress={() => setIsMinimized(true)} style={styles.minimizeBtn}>
                    <Feather name="minimize-2" size={20} color="#718096" />
                 </TouchableOpacity>
              </View>

              {/* Tempo Gigante */}
              <View style={styles.overtimeBody}>
                 <Text style={styles.overtimeTime}>{formatTime(secondsRemaining)}</Text>
              </View>

              {/* Ação Principal */}
              <TouchableOpacity style={styles.overtimeActionBtn} onPress={handleNextSet}>
                 <Text style={styles.overtimeActionText}>PRÓXIMA SÉRIE</Text>
                 <Feather name="arrow-right" size={20} color="#FFF" />
              </TouchableOpacity>

           </View>
        </View>
      )}

      {/* --- MODAL WHEEL PICKER --- */}
      <Modal visible={isWheelModalVisible} transparent animationType="fade" onRequestClose={() => setIsWheelModalVisible(false)}>
        <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Tempo de Descanso</Text>
              <View style={styles.wheelContainer}>
                 <View style={styles.wheelHighlight} />
                 <FlatList
                    data={TIME_OPTIONS}
                    keyExtractor={item => item.toString()}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    onMomentumScrollEnd={(ev) => {
                       const index = Math.round(ev.nativeEvent.contentOffset.y / ITEM_HEIGHT);
                       if (TIME_OPTIONS[index]) {
                          setSelectedCustomTime(TIME_OPTIONS[index]);
                          triggerHaptic('selection');
                       }
                    }}
                    renderItem={({ item }) => (
                       <TouchableOpacity 
                          style={[styles.pickerItem, { height: ITEM_HEIGHT }]} 
                          onPress={() => setSelectedCustomTime(item)}
                       >
                          <Text style={[styles.pickerText, selectedCustomTime === item && styles.pickerTextSelected]}>
                             {formatLabel(item)}
                          </Text>
                       </TouchableOpacity>
                    )}
                 />
              </View>
              <View style={styles.modalActions}>
                 <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setIsWheelModalVisible(false)}>
                    <Feather name="x" size={24} color="#A0AEC0" />
                 </TouchableOpacity>
                 <TouchableOpacity style={styles.modalBtnStart} onPress={handleStartCustom}>
                    <Feather name="play" size={24} color="#FFF" />
                    <Text style={styles.btnStartText}>INICIAR</Text>
                 </TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 998 },
  fabContainer: { position: 'absolute', width: FAB_SIZE, height: FAB_SIZE, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8, borderWidth: 2, borderColor: '#FFF', zIndex: 1001 },
  fabIdle: { backgroundColor: '#718096' },
  fabActive: { backgroundColor: '#007AFF', borderColor: '#1A202C' },
  fabOvertime: { backgroundColor: '#E53E3E', borderColor: '#FFF' },
  fabTimerText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },

  satellitesLayer: { position: 'absolute', zIndex: 999 },
  satelliteContainer: { position: 'absolute', width: SATELLITE_SIZE, height: SATELLITE_SIZE, justifyContent: 'center', alignItems: 'center' },
  satelliteBtnBase: { width: SATELLITE_SIZE, height: SATELLITE_SIZE, borderRadius: SATELLITE_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 },
  satelliteNormal: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' },
  satelliteSelected: { backgroundColor: '#007AFF', borderWidth: 1, borderColor: '#0056b3' },
  satelliteStop: { backgroundColor: '#FFF', borderWidth: 2, borderColor: '#E53E3E' },
  satelliteAdd: { backgroundColor: '#F0F9FF', borderColor: '#BEE3F8' },
  satelliteLocked: { backgroundColor: '#F7FAFC', borderColor: '#E2E8F0', opacity: 0.7 },
  satelliteText: { fontSize: 11, fontWeight: '600', color: '#4A5568' },
  stopIconWrapper: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  stopSquare: { width: 14, height: 14, borderRadius: 2, backgroundColor: '#E53E3E' },
  lockIcon: { position: 'absolute', top: -3, right: -3, backgroundColor: '#2D3748', borderRadius: 5, padding: 1 },

  // --- OVERTIME STYLES ---
  overtimeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: 20 },
  overtimeCard: { width: '90%', backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10 },
  overtimeHeader: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  overtimeTitle: { fontSize: 18, fontWeight: '800', color: '#E53E3E', textTransform: 'uppercase' },
  minimizeBtn: { padding: 8, backgroundColor: '#EDF2F7', borderRadius: 20 },
  overtimeBody: { marginBottom: 24 },
  overtimeTime: { fontSize: 56, fontWeight: '900', color: '#2D3748', fontVariant: ['tabular-nums'] },
  overtimeActionBtn: { backgroundColor: '#E53E3E', width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8, shadowColor: '#E53E3E', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  overtimeActionText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  // --- MODAL WHEEL STYLES ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: width * 0.8, backgroundColor: '#FFF', borderRadius: 24, padding: 20, alignItems: 'center', elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#2D3748', marginBottom: 20 },
  wheelContainer: { height: ITEM_HEIGHT * 3, width: '100%', overflow: 'hidden', marginBottom: 24 },
  wheelHighlight: { position: 'absolute', top: ITEM_HEIGHT, left: 0, right: 0, height: ITEM_HEIGHT, backgroundColor: '#F0F9FF', borderRadius: 10, borderColor: '#007AFF', borderWidth: 1 },
  pickerItem: { justifyContent: 'center', alignItems: 'center' },
  pickerText: { fontSize: 20, color: '#A0AEC0', fontWeight: '500' },
  pickerTextSelected: { fontSize: 24, color: '#007AFF', fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 16, width: '100%' },
  modalBtnCancel: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EDF2F7', justifyContent: 'center', alignItems: 'center' },
  modalBtnStart: { flex: 1, height: 50, borderRadius: 25, backgroundColor: '#007AFF', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnStartText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});