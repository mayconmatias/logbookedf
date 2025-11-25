import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  Vibration,
  Platform,
  TouchableWithoutFeedback,
  TextInput,
  Alert,
  Keyboard
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTimer } from '@/context/TimerContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigate } from '@/utils/navigationRef';

// [MODERNIZADO] Usando Gesture Detector (RN 0.81 Friendly)
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withDelay,
  withTiming,
  interpolate,
  runOnJS
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const FAB_SIZE = 60;
const SATELLITE_SIZE = 44;
const RADIUS = 110; 
const MARGIN = 20;

const SatelliteButton = ({ 
  index, 
  totalItems, 
  isOpen, 
  onPress, 
  onLongPress,
  children, 
  style 
}: any) => {
  const startAngle = -90; 
  const angleSpan = 100; 
  
  const step = totalItems > 1 ? angleSpan / (totalItems - 1) : 0;
  const angleDeg = startAngle + (index * step);
  const angleRad = angleDeg * (Math.PI / 180);

  const targetX = Math.cos(angleRad) * RADIUS;
  const targetY = Math.sin(angleRad) * RADIUS;

  const animVal = useSharedValue(0);

  React.useEffect(() => {
    if (isOpen) {
      animVal.value = withDelay(index * 40, withSpring(1, { damping: 14, stiffness: 120 }));
    } else {
      animVal.value = withTiming(0, { duration: 200 });
    }
  }, [isOpen]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: interpolate(animVal.value, [0, 1], [0, targetX]) },
        { translateY: interpolate(animVal.value, [0, 1], [0, targetY]) },
        { scale: animVal.value },
      ],
      opacity: animVal.value,
    };
  });

  return (
    <Animated.View style={[styles.satelliteContainer, animatedStyle]}>
      <TouchableOpacity 
        style={[styles.satelliteBtnBase, style]} 
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        activeOpacity={0.8}
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
  const [isAddingMode, setIsAddingMode] = useState(false);
  
  const [newMin, setNewMin] = useState('');
  const [newSec, setNewSec] = useState('');

  const insets = useSafeAreaInsets();

  // --- GESTURE LOGIC (Gesture API) ---
  const x = useSharedValue(MARGIN);
  const y = useSharedValue(height - insets.bottom - 150);
  
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .enabled(!isAddingMode)
    .onStart(() => {
      contextX.value = x.value;
      contextY.value = y.value;
    })
    .onUpdate((event) => {
      x.value = contextX.value + event.translationX;
      y.value = contextY.value + event.translationY;
    })
    .onEnd(() => {
      const minX = MARGIN;
      const maxX = width - FAB_SIZE - MARGIN;
      const minY = insets.top + MARGIN;
      const maxY = height - insets.bottom - FAB_SIZE - MARGIN;

      if (x.value < width / 2) x.value = withSpring(minX);
      else x.value = withSpring(maxX);

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
    if (isAddingMode) return;
    if (isActive || isOvertime) {
      setIsMenuOpen(!isMenuOpen);
    } else {
      startTimer();
    }
  };

  const handleStop = () => {
    stopTimer();
    setIsMenuOpen(false);
  };

  const handleSelectPreset = (index: number) => {
    selectPreset(index);
    setIsMenuOpen(false);
  };

  const handleDeletePreset = (secsToDelete: number) => {
    if (!isPro) {
       Alert.alert('Funcionalidade PRO', 'Apenas usuários PRO podem editar os tempos.');
       return;
    }
    if (presets.length <= 1) {
      Alert.alert('Erro', 'Você precisa ter pelo menos um tempo configurado.');
      return;
    }
    Alert.alert('Remover Tempo', `Deseja remover este preset?`, [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Remover', 
        style: 'destructive', 
        onPress: () => {
          const newPresets = presets.filter(s => s !== secsToDelete);
          updatePresets(newPresets);
          if (Platform.OS !== 'web') Vibration.vibrate(50);
        } 
      }
    ]);
  };

  const handleStartAdd = () => {
    if (!isPro) {
      setIsMenuOpen(false);
      Alert.alert('Funcionalidade PRO', 'Assine para criar tempos de descanso personalizados.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Ver Planos', onPress: () => navigate('CoachPaywall') }
      ]);
      return;
    }
    setIsMenuOpen(false);
    setTimeout(() => setIsAddingMode(true), 200);
  };

  const handleConfirmAdd = async () => {
    const m = parseInt(newMin || '0', 10);
    const s = parseInt(newSec || '0', 10);
    const total = (m * 60) + s;
    if (total <= 0) {
      Alert.alert('Erro', 'O tempo deve ser maior que zero.');
      return;
    }
    const newPresets = [...presets, total];
    const uniqueSorted = Array.from(new Set(newPresets)).sort((a, b) => a - b);
    await updatePresets(uniqueSorted);
    const newIndex = uniqueSorted.indexOf(total);
    if (newIndex !== -1) selectPreset(newIndex);
    handleCancelAdd();
  };

  const handleCancelAdd = () => {
    setNewMin('');
    setNewSec('');
    setIsAddingMode(false);
    Keyboard.dismiss();
  };

  const menuItems = [];

  if (isActive || isOvertime) {
    menuItems.push({
      key: 'stop',
      component: (
        <View style={styles.stopIconWrapper}>
           <View style={styles.stopSquare} />
        </View>
      ),
      onPress: handleStop,
      isStop: true,
      isSelected: false,
      onLongPress: undefined 
    });
  }

  presets.forEach((secs, idx) => {
    const isLocked = !isPro && idx !== 0;
    const isSelected = activePresetIndex === idx;
    menuItems.push({
      key: `preset-${idx}`,
      component: (
        <>
          <Text style={[styles.satelliteText, isSelected && { color: '#FFF', fontWeight: 'bold' }]}>
             {formatLabel(secs)}
          </Text>
          {isLocked && <Feather name="lock" size={8} color="#A0AEC0" style={styles.lockIcon} />}
        </>
      ),
      onPress: () => handleSelectPreset(idx),
      onLongPress: () => handleDeletePreset(secs),
      isSelected,
      isStop: false
    });
  });

  menuItems.push({
    key: 'add-btn',
    component: (
       <View>
         <Feather name="plus" size={20} color={isPro ? "#007AFF" : "#A0AEC0"} />
         {!isPro && <Feather name="lock" size={8} color="#A0AEC0" style={styles.lockIcon} />}
       </View>
    ),
    onPress: handleStartAdd,
    isSelected: false,
    isStop: false,
    isAdd: true,
    onLongPress: undefined 
  });

  if (isOvertime && !isMenuOpen && !isAddingMode) {
     return (
      <View style={[styles.alertOverlay, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <Feather name="bell" size={28} color="#FFF" style={{ marginRight: 10 }} />
            <Text style={styles.alertTitle}>DESCANSO FINALIZADO</Text>
          </View>
          <Text style={styles.overtimeText}>{formatTime(secondsRemaining)}</Text>
          <TouchableOpacity style={styles.alertButton} onPress={stopTimer}>
            <Text style={styles.alertButtonText}>PRÓXIMA SÉRIE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      {(isMenuOpen || isAddingMode) && (
        <TouchableWithoutFeedback onPress={() => {
           if (isAddingMode) handleCancelAdd();
           else setIsMenuOpen(false);
        }}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
      )}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.fabContainer, fabStyle]}>
          
          {isAddingMode && (
            <View style={styles.addFormContainer}>
               <Text style={styles.addFormTitle}>Novo Tempo</Text>
               <View style={styles.inputsRow}>
                 <TextInput 
                   style={styles.timeInput} 
                   placeholder="0" 
                   keyboardType="number-pad"
                   value={newMin}
                   onChangeText={setNewMin}
                   maxLength={2}
                   autoFocus
                 />
                 <Text style={styles.timeSep}>m</Text>
                 <TextInput 
                   style={styles.timeInput} 
                   placeholder="00" 
                   keyboardType="number-pad"
                   value={newSec}
                   onChangeText={setNewSec}
                   maxLength={2}
                 />
                 <Text style={styles.timeSep}>s</Text>
               </View>
               <View style={styles.formActions}>
                 <TouchableOpacity onPress={handleCancelAdd} style={styles.formBtnCancel}>
                    <Feather name="x" size={18} color="#E53E3E" />
                 </TouchableOpacity>
                 <TouchableOpacity onPress={handleConfirmAdd} style={styles.formBtnConfirm}>
                    <Feather name="check" size={18} color="#FFF" />
                 </TouchableOpacity>
               </View>
            </View>
          )}

          {!isAddingMode && (
             <View style={styles.satellitesLayer}>
              {menuItems.map((item, idx) => (
                <SatelliteButton
                  key={item.key}
                  index={idx}
                  totalItems={menuItems.length}
                  isOpen={isMenuOpen}
                  onPress={item.onPress}
                  onLongPress={item.onLongPress}
                  style={[
                    styles.satelliteBtnBase,
                    item.isStop 
                      ? styles.satelliteStop 
                      : (item.isSelected ? styles.satelliteSelected : styles.satelliteNormal),
                    item.isAdd && styles.satelliteAdd
                  ]}
                >
                  {item.component}
                </SatelliteButton>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={[
              styles.fab, 
              isActive ? styles.fabActive : styles.fabIdle,
              isOvertime && styles.fabOvertime,
              isAddingMode && styles.fabHidden
            ]} 
            onPress={handleMainTap}
            onLongPress={() => {
              if (isAddingMode) return;
              if (Platform.OS !== 'web') Vibration.vibrate(50);
              setIsMenuOpen(true);
            }}
            delayLongPress={300}
            activeOpacity={0.9}
          >
            {isActive ? (
              <Text style={styles.fabTimerText}>{formatTime(secondsRemaining)}</Text>
            ) : (
              <Feather name={isAddingMode ? "edit-2" : "clock"} size={28} color="#FFF" />
            )}
          </TouchableOpacity>

        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 998, backgroundColor: 'rgba(0,0,0,0.3)' },
  fabContainer: { position: 'absolute', top: 0, left: 0, width: FAB_SIZE, height: FAB_SIZE, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8, borderWidth: 2, borderColor: '#FFF', zIndex: 1001, backgroundColor: '#718096' },
  fabIdle: { backgroundColor: '#718096' },
  fabActive: { backgroundColor: '#007AFF', borderColor: '#1A202C' },
  fabOvertime: { backgroundColor: '#E53E3E', borderColor: '#FFF' },
  fabHidden: { opacity: 0 },
  fabTimerText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  satellitesLayer: { position: 'absolute', zIndex: 999 },
  satelliteContainer: { position: 'absolute', width: SATELLITE_SIZE, height: SATELLITE_SIZE, justifyContent: 'center', alignItems: 'center' },
  satelliteBtnBase: { width: SATELLITE_SIZE, height: SATELLITE_SIZE, borderRadius: SATELLITE_SIZE / 2, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 },
  satelliteNormal: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' },
  satelliteSelected: { backgroundColor: '#007AFF', borderWidth: 1, borderColor: '#0056b3' },
  satelliteStop: { backgroundColor: '#FFF', borderWidth: 2, borderColor: '#E53E3E' },
  satelliteAdd: { backgroundColor: '#F0F9FF', borderColor: '#BEE3F8' },
  satelliteText: { fontSize: 11, fontWeight: '600', color: '#4A5568' }, 
  stopIconWrapper: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  stopSquare: { width: 14, height: 14, borderRadius: 2, backgroundColor: '#E53E3E' },
  lockIcon: { position: 'absolute', top: -3, right: -3, backgroundColor: '#2D3748', borderRadius: 5, padding: 1 },
  addFormContainer: { position: 'absolute', bottom: 0, left: 0, backgroundColor: '#FFF', borderRadius: 20, padding: 16, width: 180, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10, zIndex: 1002 },
  addFormTitle: { fontSize: 12, fontWeight: 'bold', color: '#718096', marginBottom: 8, textTransform: 'uppercase' },
  inputsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  timeInput: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0', textAlign: 'center', fontSize: 16, fontWeight: 'bold', color: '#2D3748' },
  timeSep: { fontSize: 14, color: '#A0AEC0', marginHorizontal: 4 },
  formActions: { flexDirection: 'row', gap: 12 },
  formBtnCancel: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF5F5', justifyContent: 'center', alignItems: 'center' },
  formBtnConfirm: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#38A169', justifyContent: 'center', alignItems: 'center' },
  alertOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end', zIndex: 9999, paddingHorizontal: 20 },
  alertCard: { width: '100%', backgroundColor: '#D97706', borderRadius: 20, padding: 24, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10, marginBottom: 20 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  alertTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  overtimeText: { fontSize: 32, fontWeight: 'bold', color: '#FFF', marginBottom: 20, fontVariant: ['tabular-nums'] },
  alertButton: { backgroundColor: '#FFF', width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  alertButtonText: { color: '#D97706', fontSize: 18, fontWeight: 'bold' },
});