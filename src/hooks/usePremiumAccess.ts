import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabaseClient';
import { navigate } from '@/utils/navigationRef';

export const usePremiumAccess = () => {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  // Limite para usuários gratuitos
  const FREE_PROGRAM_LIMIT = 3;

  const checkPlan = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('subscription_plan')
        .eq('id', user.id)
        .single();

      // Consideramos PRO se o plano contiver 'premium' ou 'coach'
      const plan = data?.subscription_plan || 'free';
      const hasAccess = plan.includes('premium') || plan.includes('coach');
      
      setIsPro(hasAccess);
    } catch (error) {
      console.log('Erro ao verificar plano:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPlan();
  }, [checkPlan]);

  /**
   * Verifica se pode criar um novo programa baseado na contagem atual.
   * Se falhar, exibe o alerta de Paywall automaticamente (se showModal = true).
   */
  const canCreateProgram = (currentCount: number, showModal = true): boolean => {
    if (loading) return false; // Bloqueia enquanto carrega
    if (isPro) return true;    // Pro é ilimitado

    if (currentCount >= FREE_PROGRAM_LIMIT) {
      if (showModal) {
        Alert.alert(
          'Limite Atingido 🔒',
          `No plano gratuito você pode ter até ${FREE_PROGRAM_LIMIT} programas. Atualize para criar ilimitados!`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Ser Premium', onPress: () => navigate('CoachPaywall') }
          ]
        );
      }
      return false;
    }
    return true;
  };

  /**
   * Verifica acesso ao Timer Customizado.
   */
  const canEditTimer = (showModal = true): boolean => {
    if (isPro) return true;

    if (showModal) {
      Alert.alert(
        'Funcionalidade Premium 🔒',
        'Ajuste fino do timer e presets ilimitados são exclusivos para assinantes.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ser Premium', onPress: () => navigate('CoachPaywall') }
        ]
      );
    }
    return false;
  };

  return {
    isPro,
    loading,
    checkPlan, // Exposto para recarregar após uma compra
    canCreateProgram,
    canEditTimer,
    limits: {
      programs: FREE_PROGRAM_LIMIT
    }
  };
};