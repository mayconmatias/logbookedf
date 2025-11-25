import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image
} from 'react-native';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

type ProfileScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Profile'
>;

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Estados do formulário
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Carrega os dados do perfil ao abrir a tela
  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuário não encontrado');
        }
        setUser(user);

        setCpf(user.user_metadata?.cpf || 'CPF não encontrado');

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('display_name, username, avatar_url')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (profile) {
          setDisplayName(profile.display_name || '');
          setUsername(profile.username || '');
          setAvatarUrl(profile.avatar_url || null);
        }
      } catch (e: any) {
        Alert.alert('Erro', 'Não foi possível carregar seu perfil.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Função para selecionar e fazer upload da imagem
  const handlePickImage = async () => {
    try {
      // 1. Selecionar Imagem
      const result = await ImagePicker.launchImageLibraryAsync({
        // [CORREÇÃO] Voltamos para MediaTypeOptions para satisfazer o TypeScript
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], 
        quality: 0.5,   
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const image = result.assets[0];
      setUploading(true);

      if (!user) throw new Error('Usuário não autenticado');

      // 2. Preparar arquivo para envio (Supabase precisa de ArrayBuffer ou Blob)
      const response = await fetch(image.uri);
      const arrayBuffer = await response.arrayBuffer();
      
      // Extensão do arquivo
      const fileExt = image.uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
      const path = `${user.id}/avatar.${fileExt}`;

      // 3. Upload para o Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, {
          contentType: image.mimeType ?? 'image/jpeg',
          upsert: true, // Substitui se já existir
        });

      if (uploadError) {
        throw uploadError;
      }

      // 4. Pegar URL Pública
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      
      // Adiciona timestamp para evitar cache do React Native se a imagem mudou
      const publicUrl = `${data.publicUrl}?t=${new Date().getTime()}`;
      
      setAvatarUrl(publicUrl);
      
      // 5. Salvar URL no Perfil imediatamente (UX melhor)
      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

    } catch (e: any) {
      Alert.alert('Erro no Upload', e.message);
    } finally {
      setUploading(false);
    }
  };

  // Função para salvar texto (Nome/Username)
  const handleUpdateProfile = async () => {
    if (!user || !user.email) {
      Alert.alert('Erro', 'Sessão inválida. Tente fazer login novamente.');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        id: user.id,
        display_name: displayName,
        username: username,
        email: user.email,
        // avatar_url já é salvo no upload, mas garantimos aqui também se houver
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        updated_at: new Date(),
      };

      const { error } = await supabase.from('profiles').upsert(updates);

      if (error) {
        if (error.code === '23505') {
          throw new Error('Este nome de usuário já está em uso.');
        }
        throw error;
      }
      Alert.alert('Sucesso', 'Perfil atualizado!');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro ao Salvar', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setSaving(true);
    const { error } = await supabase.auth.signOut();
    setSaving(false);
    if (error) {
      Alert.alert('Erro', 'Não foi possível sair.');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      );
    }

    return (
      <>
        {/* ÁREA DO AVATAR */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={handlePickImage} disabled={uploading}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Feather name="user" size={40} color="#A0AEC0" />
                </View>
              )}
              
              {/* Ícone de edição sobreposto */}
              <View style={styles.editIconBadge}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Feather name="camera" size={14} color="#FFF" />
                )}
              </View>
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhotoText}>Toque para alterar foto</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>CPF (não pode ser alterado)</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={cpf}
            editable={false}
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Nome (para o "Bem-vindo")</Text>
          <TextInput
            style={styles.input}
            placeholder="Seu nome completo"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Nome de Usuário</Text>
          <TextInput
            style={styles.input}
            placeholder="@seunomeunico"
            value={username}
            onChangeText={(text) =>
              setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            }
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Apenas letras minúsculas, números e _.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.buttonPrimary, saving && styles.buttonDisabled]}
          onPress={handleUpdateProfile}
          disabled={saving}
        >
          {saving && !loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonTextPrimary}>Salvar Alterações</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={handleLogout}
          disabled={saving}
        >
          <Feather name="log-out" size={16} color="#E53E3E" />
          <Text style={styles.buttonTextSecondary}>Sair (Logout)</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {renderContent()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  editIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  changePhotoText: {
    marginTop: 8,
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#777',
  },
  hint: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  buttonPrimary: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E53E3E',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  buttonTextSecondary: {
    color: '#E53E3E',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9',
  },
});