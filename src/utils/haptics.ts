import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import * as Device from 'expo-device'; // Vamos usar se tiver, se não, usamos verificação simples

// Se não quiser instalar expo-device agora, podemos usar uma verificação simples:
const isSimulator = !Device.isDevice; 

export const triggerHaptic = async (type: 'success' | 'warning' | 'error' | 'selection' | 'light' | 'medium' | 'heavy') => {
  // Se for web ou simulador, não faz nada para evitar erros no console
  if (Platform.OS === 'web' || !Device.isDevice) {
    return;
  }

  try {
    switch (type) {
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'selection':
        await Haptics.selectionAsync();
        break;
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  } catch (error) {
    // Falha silenciosa em produção é melhor que crash
    console.log('Haptic error (ignorado):', error);
  }
};