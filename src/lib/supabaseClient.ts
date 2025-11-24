import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from "react-native";

// 1. Pega as URLs do .env
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  console.error("ERRO CRÍTICO: Variável EXPO_PUBLIC_SUPABASE_URL não encontrada.");
}
if (!SUPABASE_ANON_KEY) {
  console.error("ERRO CRÍTICO: Variável EXPO_PUBLIC_SUPABASE_ANON_KEY não encontrada.");
}

// 2. Exporta o cliente inicializado com Persistência
export const supabase = createClient(
  SUPABASE_URL!, 
  SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage, // <--- O Segredo para manter logado
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Opcional: Atualiza o refresh token quando o app volta do background
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});