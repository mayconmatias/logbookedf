import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Switch,
  RefreshControl,
  Linking,
} from 'react-native';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// [NOVO] Integrações
import { createCoachSubaccount } from '@/services/asaas.service';
import { StravaConnect } from '@/components/StravaConnect';
import { useTutorial } from '@/context/TutorialContext';
import { TutorialModal } from '@/components/TutorialModal';

type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'Profile'>;

interface PurchaseItem {
  id: string;
  product: {
    id: string;
    title: string;
    cover_image: string | null;
    product_type: string;
  };
  purchase_date: string;
}

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [myPurchases, setMyPurchases] = useState<PurchaseItem[]>([]);

  const [isCoachMode, setIsCoachMode] = useState(false);
  const { resetTutorials } = useTutorial();
  const insets = useSafeAreaInsets();

  // --- CARREGAMENTO ---
  const fetchProfileData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não encontrado');
      setUser(user);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfileData(profile);

      const { data: purchases, error: purchaseError } = await supabase
        .from('user_purchases')
        .select(`
          id,
          purchase_date,
          product:marketplace_products (
            id, title, cover_image, product_type
          )
        `)
        .eq('user_id', user.id)
        .order('purchase_date', { ascending: false });

      if (purchaseError) throw purchaseError;
      // @ts-ignore
      setMyPurchases(purchases || []);

    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao carregar perfil.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
    }, [fetchProfileData])
  );

  // --- UPLOAD FOTO ---
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (result.canceled || !result.assets[0]) return;

      setUploading(true);
      const image = result.assets[0];
      const fileExt = image.uri.split('.').pop()?.toLowerCase() ?? 'jpeg';
      const path = `${user!.id}/avatar.${fileExt}`;

      const response = await fetch(image.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, { contentType: image.mimeType ?? 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${new Date().getTime()}`;

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user!.id);

      setProfileData((prev: any) => ({ ...prev, avatar_url: publicUrl }));

    } catch (e: any) {
      Alert.alert('Erro no Upload', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleSwitchMode = (value: boolean) => {
    setIsCoachMode(value);
    if (value) {
      navigation.navigate('CoachStudentsList');
    }
  };

  // --- [NOVO] ATIVAR RECEBIMENTOS (FINANCEIRO) ---
  const handleActivatePayments = async () => {
    Alert.alert(
      "Ativar Carteira",
      "Deseja criar sua conta financeira para receber pagamentos de consultoria?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Criar Conta",
          onPress: async () => {
            try {
              setLoading(true);
              // Dados mockados para o MVP. Em produção, use um formulário real.
              await createCoachSubaccount({
                name: profileData?.display_name || "Coach",
                email: user?.email || "",
                cpfCnpj: profileData?.cpf || "00000000000",
                mobilePhone: "11999999999",
                address: "Rua Digital",
                addressNumber: "100",
                province: "Centro",
                postalCode: "01001000"
              });
              Alert.alert("Sucesso", "Sua carteira digital foi criada! Agora você pode vender planos.");
              fetchProfileData();
            } catch (e: any) {
              Alert.alert("Erro Financeiro", e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const getPlanBadge = (plan: string) => {
    if (plan?.includes('coach_pro')) return { label: 'TREINADOR PRO', color: '#805AD5', icon: 'briefcase' };
    if (plan?.includes('coach')) return { label: 'TREINADOR', color: '#319795', icon: 'briefcase' };
    if (plan === 'premium') return { label: 'PREMIUM', color: '#D69E2E', icon: 'star' };
    return { label: 'GRATUITO', color: '#718096', icon: 'user' };
  };

  if (loading && !profileData) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  const badge = getPlanBadge(profileData?.subscription_plan);
  const isCoach = profileData?.subscription_plan?.includes('coach');

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProfileData(); }} />}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickImage} disabled={uploading} style={styles.avatarWrapper}>
            {profileData?.avatar_url ? (
              <Image source={{ uri: profileData.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="user" size={40} color="#A0AEC0" />
              </View>
            )}
            {uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#FFF" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Feather name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.identityInfo}>
            <Text style={styles.name}>{profileData?.display_name || 'Usuário'}</Text>
            <Text style={styles.username}>@{profileData?.username || 'sem_user'}</Text>

            <View style={[styles.planBadge, { backgroundColor: badge.color }]}>
              {/* @ts-ignore */}
              <Feather name={badge.icon} size={10} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.planText}>{badge.label}</Text>
            </View>
          </View>
        </View>

        {/* SWITCH E FINANCEIRO DO COACH */}
        {isCoach && (
          <View>
            <View style={styles.coachSwitchContainer}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Modo Treinador</Text>
                <Text style={styles.switchSub}>Gerenciar alunos e treinos</Text>
              </View>
              <Switch
                trackColor={{ false: "#767577", true: "#805AD5" }}
                thumbColor={isCoachMode ? "#FFF" : "#f4f3f4"}
                onValueChange={handleSwitchMode}
                value={isCoachMode}
              />
            </View>

            {/* Botão Financeiro: Só aparece se ainda não tiver wallet */}
            {!profileData?.asaas_wallet_id && (
              <TouchableOpacity
                style={styles.financeButton}
                onPress={handleActivatePayments}
              >
                <Feather name="dollar-sign" size={20} color="#38A169" />
                <Text style={styles.financeButtonText}>Ativar Recebimentos</Text>
                <Feather name="chevron-right" size={20} color="#38A169" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* INTEGRAÇÃO STRAVA */}
      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <StravaConnect />
      </View>

      {/* MINHA BIBLIOTECA */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="book-open" size={18} color="#4A5568" />
          <Text style={styles.sectionTitle}>Minha Biblioteca</Text>
        </View>

        {myPurchases.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.libraryList}>
            {myPurchases.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.libraryCard}
                onPress={() => {
                  if (item.product.product_type.includes('program')) {
                    navigation.navigate('MyPrograms');
                  } else {
                    navigation.navigate('ExerciseCatalog');
                  }
                }}
              >
                {item.product.cover_image ? (
                  <Image source={{ uri: item.product.cover_image }} style={styles.libraryImage} />
                ) : (
                  <View style={[styles.libraryPlaceholder, { backgroundColor: item.product.product_type.includes('program') ? '#EBF8FF' : '#E6FFFA' }]}>
                    <Feather
                      name={item.product.product_type.includes('program') ? "calendar" : "list"}
                      size={24}
                      color={item.product.product_type.includes('program') ? "#3182CE" : "#38A169"}
                    />
                  </View>
                )}
                <Text style={styles.libraryTitle} numberOfLines={2}>{item.product.title}</Text>
                <Text style={styles.libraryType}>
                  {item.product.product_type.includes('program') ? 'Programa' : 'Lista'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <TouchableOpacity style={styles.emptyLibrary} onPress={() => navigation.navigate('Marketplace')}>
            <Text style={styles.emptyLibraryText}>Você ainda não tem itens.</Text>
            <Text style={styles.linkText}>Ir para a Loja</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ASSINATURA */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="credit-card" size={18} color="#4A5568" />
          <Text style={styles.sectionTitle}>Assinatura</Text>
        </View>

        {!isCoach ? (
          <LinearGradient colors={['#2D3748', '#1A202C']} style={styles.upgradeCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Seja um Treinador PRO</Text>
              <Text style={styles.upgradeSub}>Gerencie alunos ilimitados, venda seus treinos e tenha acesso a ferramentas exclusivas.</Text>
            </View>
            <TouchableOpacity style={styles.upgradeButton} onPress={() => navigation.navigate('CoachPaywall')}>
              <Text style={styles.upgradeButtonText}>Conhecer</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <View style={styles.activePlanCard}>
            <View>
              <Text style={styles.activePlanTitle}>Plano Ativo</Text>
              <Text style={styles.activePlanName}>{badge.label}</Text>
            </View>
            <Feather name="check-circle" size={24} color="#38A169" />
          </View>
        )}
      </View>

      {/* MENU */}
      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem} onPress={() => Alert.prompt('Editar Nome', 'Novo nome:', async (t) => {
          if (t) {
            await supabase.from('profiles').update({ display_name: t }).eq('id', user!.id);
            setProfileData({ ...profileData, display_name: t });
          }
        })}>
          <Feather name="edit-2" size={20} color="#4A5568" />
          <Text style={styles.menuText}>Editar Nome de Exibição</Text>
          <Feather name="chevron-right" size={20} color="#CBD5E0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert(
          "Reiniciar Dicas",
          "Deseja ver todas as dicas de ajuda novamente?",
          [
            { text: "Não", style: "cancel" },
            {
              text: "Sim",
              onPress: async () => {
                await resetTutorials();
                Alert.alert("Pronto", "As dicas aparecerão novamente ao navegar pelo app.");
              }
            }
          ]
        )}>
          <Feather name="help-circle" size={20} color="#4A5568" />
          <Text style={styles.menuText}>Reiniciar Dicas de Ajuda</Text>
          <Feather name="refresh-cw" size={20} color="#CBD5E0" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
          <Feather name="log-out" size={20} color="#4A5568" />
          <Text style={styles.menuText}>Sair da Conta</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, { borderTopWidth: 1, borderColor: '#E2E8F0', marginTop: 10 }]}
          onPress={() => {
            Alert.alert(
              "Excluir Conta",
              "Você será redirecionado para nossa página web para confirmar a exclusão da sua conta.",
              [
                { text: "Cancelar", style: "cancel" },
                { text: "Continuar", style: "destructive", onPress: () => Linking.openURL("https://www.logbookedf.pro/excluir-conta") }
              ]
            );
          }}
        >
          <Feather name="trash-2" size={20} color="#E53E3E" />
          <Text style={[styles.menuText, { color: '#E53E3E' }]}>Excluir minha conta</Text>
          <Feather name="external-link" size={16} color="#E53E3E" />
        </TouchableOpacity>
      </View>

      <View style={styles.footerInfo}>
        <Text style={styles.versionText}>Logbook EdF v1.0.3</Text>
        <Text style={styles.userIdText}>ID: {user?.id.slice(0, 8)}...</Text>
      </View>

      <TutorialModal
        tutorialKey="profile_screen"
        title="Seu Perfil"
        description="Aqui você vê seus programas comprados, gerencia sua assinatura e pode ativar o Modo Treinador para vender seus treinos."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { backgroundColor: '#FFF', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  avatarSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EDF2F7', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#CBD5E0' },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007AFF', padding: 6, borderRadius: 12, borderWidth: 2, borderColor: '#FFF' },

  identityInfo: { marginLeft: 16, flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#1A202C' },
  username: { fontSize: 14, color: '#718096', marginBottom: 6 },
  planBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  planText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  coachSwitchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF5FF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E9D8FD' },
  switchTitle: { fontSize: 16, fontWeight: '700', color: '#553C9A' },
  switchSub: { fontSize: 12, color: '#805AD5' },

  financeButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FFF4',
    padding: 12, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#C6F6D5'
  },
  financeButtonText: { color: '#276749', fontWeight: '700', marginLeft: 10 },

  section: { marginTop: 20, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3748' },

  libraryList: { gap: 12, paddingRight: 20 },
  libraryCard: { width: 120, marginRight: 12 },
  libraryImage: { width: 120, height: 80, borderRadius: 8, marginBottom: 6 },
  libraryPlaceholder: { width: 120, height: 80, borderRadius: 8, marginBottom: 6, justifyContent: 'center', alignItems: 'center' },
  libraryTitle: { fontSize: 12, fontWeight: '600', color: '#2D3748', marginBottom: 2 },
  libraryType: { fontSize: 10, color: '#718096' },
  emptyLibrary: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E0' },
  emptyLibraryText: { color: '#718096', marginBottom: 4 },
  linkText: { color: '#007AFF', fontWeight: '700' },

  upgradeCard: { flexDirection: 'row', padding: 20, borderRadius: 16, alignItems: 'center' },
  upgradeTitle: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  upgradeSub: { fontSize: 12, color: '#CBD5E0', marginRight: 10, lineHeight: 16 },
  upgradeButton: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  upgradeButtonText: { color: '#1A202C', fontWeight: '700', fontSize: 12 },

  activePlanCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  activePlanTitle: { fontSize: 12, color: '#718096', textTransform: 'uppercase', marginBottom: 2 },
  activePlanName: { fontSize: 18, fontWeight: '800', color: '#2D3748' },

  menuSection: { marginTop: 30, backgroundColor: '#FFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  menuText: { flex: 1, marginLeft: 12, fontSize: 15, color: '#2D3748', fontWeight: '500' },

  footerInfo: { padding: 30, alignItems: 'center' },
  versionText: { color: '#A0AEC0', fontSize: 12, fontWeight: '600' },
  userIdText: { color: '#CBD5E0', fontSize: 10, marginTop: 4 }
});