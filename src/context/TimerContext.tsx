import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const PRESETS_KEY = '@timer_presets';
const DEFAULT_PRESETS = [60, 90, 120, 180, 300]; // 1m, 1m30, 2m, 3m, 5m

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
  updatePresets: (newPresets: number[]) => Promise<void>; // [NOVO]
}

const TimerContext = createContext<TimerContextData>({} as TimerContextData);

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isActive, setIsActive] = useState(false);
  
  // [ATUALIZADO] Agora inicia com padrão, mas carrega do storage
  const [presets, setPresets] = useState<number[]>(DEFAULT_PRESETS);
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [isPro, setIsPro] = useState(false);

  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const notificationScheduled = useRef(false);

  // Carregar presets salvos e plano PRO
  useEffect(() => {
    const initialize = async () => {
      try {
        // 1. Carregar Presets
        const savedPresets = await AsyncStorage.getItem(PRESETS_KEY);
        if (savedPresets) {
          setPresets(JSON.parse(savedPresets));
        }

        // 2. Checar Plano
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('subscription_plan')
            .eq('id', user.id)
            .single();
          if (data && data.subscription_plan === 'coach_pro') setIsPro(true);
        }
      } catch (e) { console.log(e); }
    };
    initialize();
  }, []);

  // [NOVO] Função para salvar novos presets
  const updatePresets = async (newPresets: number[]) => {
    // Ordena do menor para o maior para ficar bonito no menu
    const sorted = [...newPresets].sort((a, b) => a - b);
    setPresets(sorted);
    await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(sorted));
    
    // Reseta o índice ativo se ele sair do range
    if (activePresetIndex >= sorted.length) {
      setActivePresetIndex(0);
    }
  };

  const startTimer = useCallback((seconds?: number) => {
    const duration = seconds || presets[activePresetIndex];
    const now = Date.now();
    const target = now + (duration * 1000);

    setSecondsRemaining(duration);
    setIsActive(true);
    notificationScheduled.current = false;

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
    });

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
    if (Platform.OS === 'ios') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const stopTimer = useCallback(() => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setIsActive(false);
    setSecondsRemaining(0);
    Notifications.cancelAllScheduledNotificationsAsync();
  }, []);

  const selectPreset = (index: number) => {
    // Lógica de bloqueio pode ser removida aqui se você quiser liberar a configuração pra todos,
    // ou mantida se quiser que Free só use o primeiro da lista personalizada.
    // Por enquanto, mantive a lógica:
    if (!isPro && index !== 0) return; 
    setActivePresetIndex(index);
  };

  const isOvertime = isActive && secondsRemaining <= 0;

  return (
    <TimerContext.Provider value={{ 
      secondsRemaining, 
      isActive, 
      isOvertime,
      startTimer, 
      stopTimer, 
      activePresetIndex, 
      presets, 
      selectPreset,
      updatePresets, // Exportando a função
      isPro
    }}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => useContext(TimerContext);