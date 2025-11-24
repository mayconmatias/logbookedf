import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  ActivityIndicator 
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '@/lib/supabaseClient';
import { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachPaywall'>;

export default function CoachPaywallScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);

  // Função FAKE de compra para testar
  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // SIMULAÇÃO: Atualiza o banco para 'coach_pro'
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_plan: 'coach_pro' })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('Parabéns!', 'Você agora é um Treinador PRO.', [
        { 
          text: 'Acessar Área do Treinador', 
          onPress: () => navigation.replace('CoachStudentsList') 
        }
      ]);

    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconContainer}>
        <Feather name="users" size={64} color="#007AFF" />
      </View>

      <Text style={styles.title}>Torne-se um Treinador PRO</Text>
      <Text style={styles.subtitle}>
        Gerencie alunos, prescreva treinos e acompanhe a evolução dos seus atletas em um só lugar.
      </Text>

      <View style={styles.benefitsContainer}>
        <BenefitItem icon="check" text="Alunos Ilimitados" />
        <BenefitItem icon="check" text="Prescrição de Treinos Detalhada" />
        <BenefitItem icon="check" text="Acompanhamento de Métricas e PRs" />
        <BenefitItem icon="check" text="Crie e Venda seus Templates na Loja" />
      </View>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Assinatura Mensal</Text>
        <Text style={styles.priceValue}>R$ 49,90<Text style={styles.perMonth}>/mês</Text></Text>
      </View>

      <TouchableOpacity 
        style={styles.subscribeButton} 
        onPress={handleSubscribe}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.subscribeText}>Assinar Agora</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.restoreButton} onPress={() => navigation.goBack()}>
        <Text style={styles.restoreText}>Agora não</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const BenefitItem = ({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) => (
  <View style={styles.benefitItem}>
    <Feather name={icon} size={20} color="#38A169" />
    <Text style={styles.benefitText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  iconContainer: { marginBottom: 24, padding: 20, backgroundColor: '#EBF8FF', borderRadius: 50 },
  title: { fontSize: 24, fontWeight: '800', color: '#1A202C', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#718096', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  benefitsContainer: { width: '100%', marginBottom: 32 },
  benefitItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  benefitText: { marginLeft: 12, fontSize: 16, color: '#2D3748', fontWeight: '500' },
  priceCard: { width: '100%', backgroundColor: '#F7FAFC', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 32, borderWidth: 1, borderColor: '#E2E8F0' },
  priceLabel: { fontSize: 14, color: '#718096', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  priceValue: { fontSize: 36, fontWeight: 'bold', color: '#2D3748', marginTop: 8 },
  perMonth: { fontSize: 16, color: '#718096', fontWeight: 'normal' },
  subscribeButton: { width: '100%', backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  subscribeText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  restoreButton: { marginTop: 16, padding: 10 },
  restoreText: { color: '#718096', fontSize: 14 },
});