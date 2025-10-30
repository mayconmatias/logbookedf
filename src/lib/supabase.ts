// src/lib/supabase.ts

import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto"; 

// ==========================================================
// PLANO C: IGNORAR O app.config.cts E COLAR AS CHAVES AQUI
// ==========================================================

const SUPABASE_URL = "https://ojkfzowzuyyxgmmljbsc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qa2Z6b3d6dXl5eGdtbWxqYnNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2ODI2NjEsImV4cCI6MjA3NzI1ODY2MX0.tO0Qp0naeXisEt829YidWlYJ3Dp_eUqJSe7hUeW8LwE";

// Checagem de segurança simples
if (!SUPABASE_URL) {
  console.error("ERRO CRÍTICO: Cole a SUPABASE_URL direto no supabase.ts");
}
if (!SUPABASE_ANON_KEY) {
  console.error("ERRO CRÍTICO: Cole a SUPABASE_ANON_KEY direto no supabase.ts");
}

// Cria o cliente
export const supabase = createClient(
  SUPABASE_URL, 
  SUPABASE_ANON_KEY
);