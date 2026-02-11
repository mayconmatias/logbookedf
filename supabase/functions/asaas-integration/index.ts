// supabase/functions/asaas-integration/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Configuração do Ambiente
const IS_PROD = Deno.env.get('ASAAS_ENV') === 'prod';
const BASE_URL = IS_PROD ? 'https://www.asaas.com/api/v3' : 'https://sandbox.asaas.com/api/v3';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper para chamadas ao Asaas
async function fetchAsaas(endpoint: string, method: string, body?: any) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();
  
  if (!response.ok) {
    // Tenta extrair a mensagem de erro específica do Asaas
    const errorMessage = data.errors?.[0]?.description || `Erro Asaas (${response.status})`;
    throw new Error(errorMessage);
  }
  
  return data;
}

serve(async (req) => {
  // Tratamento de CORS (Pre-flight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, body } = await req.json();

    // ========================================================================
    // AÇÃO 1: ONBOARDING (Criar Subconta do Coach)
    // ========================================================================
    if (action === 'onboarding') {
      const { name, email, cpfCnpj, mobilePhone, address, addressNumber, province, postalCode } = body;

      // 1. Cria a conta no Asaas
      const accountData = await fetchAsaas('/accounts', 'POST', {
        name,
        email,
        loginEmail: email, // O coach usa o mesmo email para login no Asaas se quiser
        cpfCnpj,
        mobilePhone,
        address,
        addressNumber,
        province,
        postalCode,
        postalService: false // Não envia cartas físicas
      });

      // 2. Salva o ID da carteira no perfil do Coach
      // Assumindo que o frontend mandou o userId ou pegamos do contexto (aqui simplificado pelo body para flexibilidade)
      // O ideal é pegar do header Authorization, mas para o setup inicial vamos aceitar do body se confiarmos na origem ou adicionar validação JWT aqui.
      
      const userId = body.userId; 
      if (userId) {
         await supabase.from('profiles').update({ 
           asaas_wallet_id: accountData.id 
         }).eq('id', userId);
      }

      return new Response(
        JSON.stringify({ walletId: accountData.id, apiKey: accountData.apiKey }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // AÇÃO 2: CHECKOUT (Cobrança com Split)
    // ========================================================================
    if (action === 'checkout') {
      const { productId, studentId, walletId } = body;

      if (!productId || !walletId) {
        throw new Error("Dados incompletos para checkout.");
      }

      // 1. Busca o preço REAL do produto no banco (Segurança)
      const { data: product, error: prodError } = await supabase
        .from('marketplace_products')
        .select('price, title')
        .eq('id', productId)
        .single();

      if (prodError || !product) {
        throw new Error("Produto não encontrado.");
      }

      const price = Number(product.price);
      if (price <= 0) throw new Error("Produto gratuito não gera cobrança.");

      // 2. Configura o Split (Regra de Negócio: 70% Coach / 30% Plataforma)
      // O Asaas pega o total, tira a taxa deles, e o restante divide.
      // Aqui definimos quanto vai para a WALLET (Subconta). O resto fica na conta MESTRA (Sua).
      
      // Opção A: Percentual Fixo
      const splitConfig = [
        {
          walletId: walletId,
          percentualValue: 70 // Coach recebe 70%
        }
      ];

      // 3. Cria a Cobrança
      const paymentPayload = {
        billingType: "PIX", // Pode ser "UNDEFINED" para o usuário escolher na tela do Asaas
        value: price,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Vence em 2 dias
        description: `Compra: ${product.title}`,
        split: splitConfig,
        // Opcional: Dados do cliente (Student) para nota fiscal
        // customer: customerIdAsaas (teria que criar o cliente antes se quiser NF rigorosa)
      };

      const paymentData = await fetchAsaas('/payments', 'POST', paymentPayload);

      // 4. (Opcional) Registrar tentativa no Ledger como 'PENDING'
      await supabase.from('financial_ledger').insert({
        transaction_id: paymentData.id,
        coach_id: null, // Pode buscar quem é o dono da walletId se precisar
        student_id: studentId,
        product_id: productId,
        amount_total: price,
        amount_coach: price * 0.7,
        amount_platform: price * 0.3,
        status: 'PENDING'
      });

      return new Response(
        JSON.stringify({ paymentUrl: paymentData.invoiceUrl, id: paymentData.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Ação desconhecida: ${action}`);

  } catch (error: any) {
    console.error('Erro na Edge Function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno no servidor' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})