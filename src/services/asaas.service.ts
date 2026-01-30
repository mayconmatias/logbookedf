// src/services/asaas.service.ts
import { supabase } from '@/lib/supabaseClient';

export interface CoachOnboardingData {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  address: string;
  addressNumber: string;
  province: string; // Bairro
  postalCode: string;
}

/**
 * Cria a subconta do Coach no Asaas para permitir Split.
 * Deve ser chamado na tela de Perfil ou Configurações do Coach.
 */
export const createCoachSubaccount = async (data: CoachOnboardingData) => {
  const { data: response, error } = await supabase.functions.invoke('asaas-onboarding', {
    body: { ...data }
  });

  if (error) throw new Error(error.message || 'Erro ao criar conta financeira.');
  return response; // Espera retornar { walletId: '...' }
};

/**
 * Gera o link de pagamento (Pix/Cartão) com Split configurado.
 */
export const purchaseWithSplit = async (productId: string) => {
  const { data: response, error } = await supabase.functions.invoke('asaas-checkout', {
    body: { productId }
  });

  if (error) throw new Error(error.message || 'Erro ao gerar pagamento.');
  return response; // Espera retornar { paymentUrl: 'https://...' }
};