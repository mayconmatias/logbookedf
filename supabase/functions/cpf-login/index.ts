// supabase/functions/cpf-login/index.ts
// Runtime: Deno (Supabase Edge Functions)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ╭──────────────────────────────────────────────────────────────╮
// │            ENV (defina como secrets da função)               │
// │  supabase secrets set SUPABASE_URL="https://xxx.supabase.co" │
// │  supabase secrets set SUPABASE_ANON_KEY="..."                │
// │  supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."        │
// ╰──────────────────────────────────────────────────────────────╯
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS — ajuste o Allow-Origin se quiser restringir
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Client com Service Role → consulta profiles(cpf → email) ignorando RLS
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Client com ANON → autentica email+senha para obter sessão
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Sanitiza e valida CPF
function sanitizeCPF(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

function isValidCpfDigits(cpf: string): boolean {
  // Aqui só garantimos 11 dígitos; a validação algorítmica é opcional
  return /^\d{11}$/.test(cpf);
}

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const { cpf: cpfRaw, password } = await req.json().catch(() => ({}));

    if (!cpfRaw || typeof cpfRaw !== "string" || !password || typeof password !== "string") {
      return new Response(JSON.stringify({ error: "CPF e password são obrigatórios" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const cpf = sanitizeCPF(cpfRaw);
    if (!isValidCpfDigits(cpf)) {
      return new Response(JSON.stringify({ error: "CPF inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // (Opcional) Rate limit básico por IP/CPF → implementar com KV/Redis se quiser
    // const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "";

    // 1) Busca e-mail pelo CPF (perfil precisa ter email persistido)
    const { data: profile, error: findErr } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("cpf", cpf)
      .single();

    // Use mensagem genérica para não vazar existência do CPF
    if (findErr || !profile || !profile.email) {
      return new Response(JSON.stringify({ error: "CPF ou senha inválidos" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2) Autentica com email+senha via ANON (gera sessão)
    const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (authErr || !authData?.session) {
      return new Response(JSON.stringify({ error: "CPF ou senha inválidos" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const session = authData.session;

    // 3) Retorna somente o necessário para o app configurar a sessão local
    const result = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type,
      expires_in: session.expires_in,
      user: {
        id: session.user.id,
        email: session.user.email,
      },
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("[cpf-login] unexpected error:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
