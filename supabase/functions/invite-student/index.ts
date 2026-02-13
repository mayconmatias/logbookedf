import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, coachName } = await req.json()
    
    // Setup Clientes
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // Precisa ser Service Role para insert seguro
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    // 1. Pega o ID do Coach que chamou a função (via Header Auth)
    const authHeader = req.headers.get('Authorization')!
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()

    if (!user) throw new Error("Não autorizado")

    // 2. Registra o Convite no Banco
    const { error: dbError } = await supabaseAdmin
      .from('coaching_invitations')
      .insert({
        coach_id: user.id,
        email: email.trim().toLowerCase(),
        status: 'pending'
      })

    if (dbError) throw new Error("Erro ao salvar convite: " + dbError.message)

    // 3. Envia o E-mail via Resend (Fetch direto)
    const link = `https://logbookedf.pro/auth/signup?email=${encodeURIComponent(email)}&coach=${encodeURIComponent(coachName)}`
    
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #4f46e5; font-size: 24px; margin: 0;">Logbook EdF</h1>
        </div>
        <h2 style="color: #1e293b; font-size: 20px;">Convite para Treinar 💪</h2>
        <p style="color: #475569; line-height: 1.6;">Olá!</p>
        <p style="color: #475569; line-height: 1.6;"><strong>${coachName}</strong> convidou você para fazer parte do time no <strong>Logbook EdF</strong>.</p>
        <p style="color: #475569; line-height: 1.6;">Crie sua conta para receber seus treinos personalizados e acompanhar sua evolução.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${link}" style="background-color: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
            Aceitar Convite
          </a>
        </div>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-top: 24px;">
          <p style="color: #64748b; font-size: 13px; margin: 0;"><strong>Já tem conta?</strong> Basta abrir o app e fazer login com este email — o vínculo com seu treinador será criado automaticamente.</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">Este email foi enviado pelo Logbook EdF. Se você não esperava receber esta mensagem, ignore-a.</p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Logbook EdF <nao-responda@mail.logbookedf.pro>',
        to: [email],
        subject: `${coachName} te convidou para treinar!`,
        html: emailHtml
      })
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error("Erro no Resend: " + err)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})