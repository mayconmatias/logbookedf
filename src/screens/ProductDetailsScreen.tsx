import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, 
  Alert, ActivityIndicator, Dimensions
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser'; // [NOVO]

import { RootStackParamList } from '@/types/navigation';
import { purchaseWithSplit } from '@/services/asaas.service'; // [ATUALIZADO]
import { supabase } from '@/lib/supabaseClient';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetails'>;
const { width } = Dimensions.get('window');

export default function ProductDetailsScreen({ navigation, route }: Props) {
  const { product } = route.params;
  const [buying, setBuying] = useState(false);

  const handleBuy = async () => {
    setBuying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado.");

      // 1. Gera o link de pagamento no Asaas (Backend cria a cobrança com Split)
      const { paymentUrl } = await purchaseWithSplit(product.id);
      
      if (!paymentUrl) throw new Error("Link de pagamento não gerado.");

      // 2. Abre o navegador in-app para o usuário pagar (Pix/Cartão)
      const result = await WebBrowser.openBrowserAsync(paymentUrl);

      // 3. Feedback ao retornar
      // O webhook do Asaas atualizará o banco 'user_purchases' em background.
      if (result.type === 'cancel' || result.type === 'dismiss') {
         Alert.alert(
            'Pagamento em Processamento', 
            'Se você concluiu o pagamento, aguarde alguns instantes para que o item apareça na sua biblioteca.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
         );
      }

    } catch (e: any) {
      Alert.alert('Erro no Pagamento', e.message || 'Falha ao iniciar checkout.');
    } finally {
      setBuying(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* HEADER IMAGEM */}
        <View style={styles.imageContainer}>
          {product.cover_image ? (
            <Image source={{ uri: product.cover_image }} style={styles.coverImage} />
          ) : (
            <LinearGradient colors={['#4c669f', '#3b5998', '#192f6a']} style={styles.placeholderImage}>
              <Feather name="package" size={64} color="rgba(255,255,255,0.5)" />
            </LinearGradient>
          )}
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* CONTEÚDO */}
        <View style={styles.content}>
          
          {/* Título e Preço */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeBadge}>
                {product.product_type.includes('program') ? 'PROGRAMA DE TREINO' : 'BIBLIOTECA DE EXERCÍCIOS'}
              </Text>
              <Text style={styles.title}>{product.title}</Text>
            </View>
            <Text style={styles.price}>
              {product.price > 0 ? `R$ ${product.price.toFixed(2)}` : 'GRÁTIS'}
            </Text>
          </View>

          {/* Badges de Metadados */}
          <View style={styles.metaContainer}>
            {product.meta_duration && (
              <View style={styles.metaItem}>
                <Feather name="clock" size={16} color="#718096" />
                <Text style={styles.metaText}>{product.meta_duration}</Text>
              </View>
            )}
            {product.meta_level && (
              <View style={styles.metaItem}>
                <Feather name="bar-chart" size={16} color="#718096" />
                <Text style={styles.metaText}>{product.meta_level}</Text>
              </View>
            )}
            {product.meta_equipment && (
              <View style={styles.metaItem}>
                <Feather name="tool" size={16} color="#718096" />
                <Text style={styles.metaText}>{product.meta_equipment}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Descrição */}
          <Text style={styles.sectionTitle}>Sobre este conteúdo</Text>
          <Text style={styles.description}>
            {product.description || "Sem descrição disponível."}
          </Text>

          {/* Preview / Benefícios */}
          <View style={styles.benefitBox}>
            <Text style={styles.benefitTitle}>O que está incluso?</Text>
            <View style={styles.benefitRow}><Feather name="check" size={16} color="#38A169" /><Text style={styles.benefitText}>Acesso vitalício ao conteúdo</Text></View>
            {product.product_type.includes('program') && (
               <View style={styles.benefitRow}><Feather name="check" size={16} color="#38A169" /><Text style={styles.benefitText}>Planejamento completo de dias</Text></View>
            )}
            <View style={styles.benefitRow}><Feather name="check" size={16} color="#38A169" /><Text style={styles.benefitText}>Vídeos de execução e instruções</Text></View>
          </View>

        </View>
      </ScrollView>

      {/* FOOTER FIXO (CTA) */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.buyButton, product.is_owned && styles.ownedButton]} 
          onPress={handleBuy}
          disabled={buying || product.is_owned}
        >
          {buying ? (
            <ActivityIndicator color="#FFF" />
          ) : product.is_owned ? (
            <Text style={styles.buyText}>JÁ ADQUIRIDO</Text>
          ) : (
            <>
              <Text style={styles.buyText}>COMPRAR AGORA</Text>
              <Feather name="shopping-cart" size={20} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  imageContainer: { height: 250, width: '100%', position: 'relative' },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholderImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  backButton: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 20 },
  
  content: { padding: 24, marginTop: -20, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  typeBadge: { fontSize: 10, fontWeight: '800', color: '#007AFF', marginBottom: 4, letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '800', color: '#1A202C', lineHeight: 28, paddingRight: 10 },
  price: { fontSize: 20, fontWeight: '700', color: '#2D3748' },

  metaContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  metaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 6 },
  metaText: { fontSize: 12, fontWeight: '600', color: '#4A5568' },

  divider: { height: 1, backgroundColor: '#EDF2F7', marginBottom: 20 },
  
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2D3748', marginBottom: 12 },
  description: { fontSize: 15, color: '#718096', lineHeight: 24, marginBottom: 24 },

  benefitBox: { backgroundColor: '#F0FFF4', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#C6F6D5' },
  benefitTitle: { fontSize: 14, fontWeight: '700', color: '#276749', marginBottom: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  benefitText: { fontSize: 13, color: '#2F855A' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingBottom: 40 },
  buyButton: { backgroundColor: '#007AFF', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 8, shadowColor: '#007AFF', shadowOpacity: 0.3, shadowOffset: {width:0, height:4}, shadowRadius: 8, elevation: 5 },
  ownedButton: { backgroundColor: '#A0AEC0', shadowOpacity: 0 },
  buyText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 }
});