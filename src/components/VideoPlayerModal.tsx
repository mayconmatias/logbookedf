import React from 'react';
import { 
  Modal, 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Text, 
  Dimensions, 
  Platform // <--- ADICIONE ESTE IMPORT
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  videoUrl: string;
  onClose: () => void;
}

export default function VideoPlayerModal({ visible, videoUrl, onClose }: Props) {
  const insets = useSafeAreaInsets();
  
  // Função simples para tentar transformar links comuns do YouTube em links de embed
  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('youtube.com/watch?v=')) {
      return url.replace('watch?v=', 'embed/');
    }
    if (url.includes('youtu.be/')) {
      return url.replace('youtu.be/', 'www.youtube.com/embed/');
    }
    // Para Google Drive e outros, geralmente o link direto de preview funciona
    return url;
  };

  const finalUrl = getEmbedUrl(videoUrl);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* O ERRO OCORRIA AQUI EMBAIXO NO Platform.OS */}
      <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? 20 : 0 }]}>
        
        {/* Header com botão de fechar */}
        <View style={styles.header}>
          <Text style={styles.title}>Demonstração</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color="#4A5568" />
          </TouchableOpacity>
        </View>

        {/* WebView */}
        <View style={styles.webviewContainer}>
          {finalUrl ? (
            <WebView 
              source={{ uri: finalUrl }} 
              style={{ flex: 1 }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsFullscreenVideo={true}
            />
          ) : (
            <View style={styles.errorContainer}>
              <Feather name="video-off" size={48} color="#CBD5E0" />
              <Text style={styles.errorText}>URL de vídeo inválida ou não fornecida.</Text>
            </View>
          )}
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  title: { fontSize: 18, fontWeight: '700', color: '#2D3748' },
  closeBtn: { padding: 4 },
  webviewContainer: { flex: 1, backgroundColor: '#000' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7FAFC' },
  errorText: { marginTop: 16, color: '#718096', fontSize: 16 }
});