import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabaseClient';
import { Alert } from 'react-native';

// ID do Cliente (Público)
const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;

// URL base do seu projeto Supabase (Ex: https://xyz.supabase.co)
// Certifique-se de que essa variável está no seu .env
const SUPABASE_PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

// A URL da Edge Function que atua como "Porteiro"
const CALLBACK_URL = `${SUPABASE_PROJECT_URL}/functions/v1/strava-callback`;

/**
 * Inicia o fluxo de OAuth com o Strava usando o Proxy do Supabase.
 * * Fluxo:
 * 1. App abre navegador -> Strava
 * 2. Usuário autoriza -> Strava redireciona para Supabase (CALLBACK_URL)
 * 3. Supabase troca token, salva no banco e redireciona para o App (Deep Link)
 */
export const connectStrava = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Erro', 'Você precisa estar logado para conectar ao Strava.');
      return false;
    }

    if (!STRAVA_CLIENT_ID || !SUPABASE_PROJECT_URL) {
      console.error('Variáveis de ambiente do Strava/Supabase não configuradas.');
      Alert.alert('Erro de Configuração', 'Chaves de API ausentes.');
      return false;
    }

    // Monta a URL de autorização
    // Passamos o user.id no parâmetro 'state' para a Edge Function saber quem está conectando
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code&scope=activity:read_all&state=${user.id}&approval_prompt=force`;

    // Abre o navegador e aguarda o retorno para o esquema do app (logbookedf://)
    const result = await WebBrowser.openAuthSessionAsync(authUrl, 'logbookedf://');

    if (result.type === 'success' && result.url) {
      // O Deep Link retornado pelo Supabase será algo como:
      // logbookedf://profile?strava_status=success
      if (result.url.includes('strava_status=success')) {
        return true;
      } else if (result.url.includes('strava_status=error')) {
        Alert.alert('Erro', 'Ocorreu um erro ao trocar o token no servidor.');
        return false;
      }
    }

    // Se o usuário fechou a janela ou cancelou
    return false;

  } catch (error: any) {
    console.error('Erro Strava Connect:', error);
    Alert.alert('Erro', 'Falha ao iniciar conexão com Strava.');
    return false;
  }
};

/**
 * Dispara a sincronização de atividades.
 * O Backend vai buscar as atividades no Strava e salvar na tabela 'external_activities'.
 */
export const syncStravaActivities = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('strava-sync-activities');

    if (error) {
      console.error('Erro Strava Sync (Status):', error.status);
      console.error('Erro Strava Sync (Body):', error);
      throw error;
    }

    return {
      success: true,
      count: data?.count || 0
    };
  } catch (error: any) {
    console.error('Erro Strava Sync:', error);
    // Não alertamos o usuário aqui para permitir sync silencioso em background
    return { success: false, count: 0 };
  }
};