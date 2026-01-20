import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import { triggerHaptic } from '@/utils/haptics';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate } from '@/utils/navigationRef'; 

// [CORREÇÃO] Configuração Atualizada de Notificações (Remove warnings)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // Mantido por compatibilidade
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, // [NOVO] Substitui o antigo alert em versões novas
    shouldShowList: true,   // [NOVO]
  }),
});

const PRESETS_KEY = '@timer_presets_v2';
const DEFAULT_PRESETS = [120, 60, 90]; 

interface TimerContextData {
  secondsRemaining: number;
  isActive: boolean;
  isOvertime: boolean;
  activePresetIndex: number;
  presets: number[];
  isPro: boolean;
  
  startTimer: (seconds?: number) => void;
  stopTimer: () => void;
  selectPreset: (index: number) => void;
  updatePresets: (newPresets: number[]) => Promise<void>;
}

const TimerContext = createContext<TimerContextData>({} as TimerContextData);

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isActive, setIsActive] = useState(false);
  
  const [presets, setPresets] = useState<number[]>(DEFAULT_PRESETS);
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [isPro, setIsPro] = useState(false);

  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const notificationScheduled = useRef(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        let userIsPro = false;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .select('subscription_plan')
              .eq('id', user.id)
              .single();
            if (data && data.subscription_plan === 'coach_pro') {
              userIsPro = true;
              setIsPro(true);
            }
          }
        } catch (err) {
          console.log("Auth check failed:", err);
        }

        const savedPresets = await AsyncStorage.getItem(PRESETS_KEY);
        if (savedPresets) {
          const parsed = JSON.parse(savedPresets);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPresets(parsed);
          }
        } else {
          setPresets(DEFAULT_PRESETS);
        }

        if (!userIsPro) {
          setActivePresetIndex(0);
        }

      } catch (e) { console.log(e); }
    };
    initialize();
  }, []);

  const updatePresets = async (newPresets: number[]) => {
    const sorted = [...newPresets].sort((a, b) => a - b);
    setPresets(sorted);
    await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(sorted));
    if (activePresetIndex >= sorted.length) setActivePresetIndex(0);
  };

  const startTimer = useCallback((seconds?: number) => {
    const duration = seconds || presets[activePresetIndex] || 120;
    const now = Date.now();
    const target = now + (duration * 1000);

    setSecondsRemaining(duration);
    setIsActive(true);
    notificationScheduled.current = false;

    try {
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Descanso Finalizado! 🔔",
          body: "Hora da próxima série.",
          sound: true,
        },
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: duration,
          repeats: false
        },
      }).catch(() => {});
    } catch (e) {}

    if (timerInterval.current) clearInterval(timerInterval.current);

    timerInterval.current = setInterval(() => {
      const currentNow = Date.now();
      const diffInSeconds = Math.ceil((target - currentNow) / 1000);
      setSecondsRemaining(diffInSeconds);

      if (diffInSeconds <= 0 && !notificationScheduled.current) {
        triggerFinishFeedback();
        notificationScheduled.current = true;
      }
    }, 200);
  }, [presets, activePresetIndex]);

  const triggerFinishFeedback = async () => {
    triggerHaptic('heavy'); // Feedback mais forte ao terminar
  };

  const stopTimer = useCallback(() => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setIsActive(false);
    setSecondsRemaining(0);
    try {
      Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    } catch(e) {}
  }, []);

  const selectPreset = (index: number) => {
    if (!isPro && index !== 0) {
       Alert.alert('Funcionalidade PRO', 'Assine o Coach PRO para usar tempos personalizados.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ver Planos', onPress: () => navigate('CoachPaywall') }
        ]);
      return; 
    }
    setActivePresetIndex(index);
  };

  const isOvertime = isActive && secondsRemaining <= 0;

  return (
    <TimerContext.Provider value={{ 
      secondsRemaining, isActive, isOvertime, startTimer, stopTimer, 
      activePresetIndex, presets, selectPreset, updatePresets, isPro
    }}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => useContext(TimerContext);