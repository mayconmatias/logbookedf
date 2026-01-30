import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const userId = searchParams.get('state') // Passamos o ID do usuário aqui para saber quem é
  const error = searchParams.get('error')

  // Redirecionamento de volta para o App (Deep Link)
  // Use o scheme definido no app.config.js
  const appRedirectUrl = 'logbookedf://profile?strava_status=';

  if (error || !code || !userId) {
    return Response.redirect(`${appRedirectUrl}error`, 302)
  }

  try {
    // 1. Troca o código pelo Token
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('EXPO_PUBLIC_STRAVA_CLIENT_ID'),
        client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
        code: code,
        grant_type: 'authorization_code'
      })
    })
    
    const tokens = await tokenRes.json()

    // 2. Salva no Banco
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('profiles').update({
      strava_access_token: tokens.access_token,
      strava_refresh_token: tokens.refresh_token,
      strava_expires_at: tokens.expires_at
    }).eq('id', userId)

    // 3. Sucesso! Volta para o App
    return Response.redirect(`${appRedirectUrl}success`, 302)

  } catch (err) {
    return Response.redirect(`${appRedirectUrl}error`, 302)
  }
})