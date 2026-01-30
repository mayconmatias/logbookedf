import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

/**
 * Tenta compartilhar a imagem diretamente para o Instagram Stories (Deep Linking).
 * Se falhar ou não estiver no iOS, usa o compartilhamento nativo do sistema.
 */
export const shareToInstagramStories = async (
  imageUri: string, 
  backgroundTopColor: string = '#2D3748', 
  backgroundBottomColor: string = '#1A202C'
) => {
  try {
    // Verifica se o arquivo existe e está acessível
    if (!imageUri) {
      throw new Error('URI da imagem inválida.');
    }

    if (Platform.OS === 'ios') {
      const scheme = 'instagram-stories://share';
      const canOpen = await Linking.canOpenURL(scheme);
      
      if (canOpen) {
        // No iOS com Expo Go/Managed, o Linking direto com blob/data pode ser restrito.
        // A abordagem mais segura sem Eject é usar o Sharing.shareAsync com opções de UTI.
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          dialogTitle: 'Compartilhar no Instagram',
          UTI: 'com.instagram.exclusivegram-stories.image' 
        });
      } else {
        // Fallback se Instagram não instalado
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          dialogTitle: 'Compartilhar Sticker'
        });
      }
    } else {
      // Android: Sharing nativo lida bem com Intents implícitas
      await Sharing.shareAsync(imageUri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar no Instagram'
      });
    }
  } catch (error: any) {
    console.error('Erro ao compartilhar:', error);
    Alert.alert('Erro', 'Não foi possível abrir o compartilhamento.');
  }
};