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
    const link = `https://logbookedf.pro/auth/signup?email=${encodeURIComponent(email)}`
    
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Convite para Treinar</h2>
        <p>Olá!</p>
        <p><strong>${coachName}</strong> convidou você para fazer parte do time no Logbook EdF.</p>
        <p>Aceite o convite para receber seus treinos e acompanhar sua evolução.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Aceitar e Criar Conta
          </a>
        </div>
        <p style="color: #666; font-size: 12px;">Se você já tem conta, basta fazer login que o vínculo será criado automaticamente.</p>
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