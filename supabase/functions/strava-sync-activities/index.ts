import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
    try {
        // 1. Instancia o cliente Supabase
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // 2. Obtém o usuário do cabeçalho de autorização
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

        if (authError || !user) {
            console.error('Auth Error:', authError)
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError }), { status: 401 })
        }

        // 3. Busca o refresh token do perfil do usuário
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('strava_refresh_token')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.strava_refresh_token) {
            console.error('Profile Error or missing token:', profileError)
            return new Response(JSON.stringify({ error: 'Strava not connected' }), { status: 400 })
        }

        // 4. Troca o refresh_token por um novo access_token
        const client_id = Deno.env.get('EXPO_PUBLIC_STRAVA_CLIENT_ID')
        const client_secret = Deno.env.get('STRAVA_CLIENT_SECRET')

        if (!client_id || !client_secret) {
            console.error('Missing STRAVA environment variables on Supabase dashboard')
            return new Response(JSON.stringify({ error: 'Server configuration error: missing Strava keys' }), { status: 500 })
        }

        const tokenRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id,
                client_secret,
                refresh_token: profile.strava_refresh_token,
                grant_type: 'refresh_token'
            })
        })

        const tokenData = await tokenRes.json()

        if (tokenData.errors || !tokenData.access_token) {
            console.error('Strava Token Refresh Error:', tokenData)
            return new Response(JSON.stringify({ error: 'Token refresh failed', details: tokenData }), { status: 400 })
        }

        // 5. Atualiza o perfil com os novos tokens
        await supabase.from('profiles').update({
            strava_access_token: tokenData.access_token,
            strava_refresh_token: tokenData.refresh_token || profile.strava_refresh_token,
            strava_expires_at: tokenData.expires_at
        }).eq('id', user.id)

        // 6. Busca atividades recentes do Strava (últimos 30 dias)
        const after = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)
        console.log(`Buscando atividades após: ${after} (User: ${user.id})`)
        const activitiesRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        })

        const activities = await activitiesRes.json()
        console.log(`Respostas do Strava: ${Array.isArray(activities) ? activities.length : 'ERRO'} atividades encontradas`)

        if (!Array.isArray(activities)) {
            console.error('Strava Fetch Error:', activities)
            return new Response(JSON.stringify({ error: 'Failed to fetch activities', details: activities }), { status: 400 })
        }

        // 7. Salva as atividades no banco (Upsert por strava_id)
        let count = 0
        for (const act of activities) {
            console.log(`Salvando atividade: ${act.name} (${act.start_date_local})`)
            const { error: upsertError } = await supabase
                .from('external_activities')
                .upsert({
                    user_id: user.id,
                    provider: 'strava',
                    external_id: String(act.id),
                    strava_id: act.id,
                    name: act.name,
                    activity_type: act.type,
                    start_date: act.start_date,
                    start_date_local: act.start_date_local,
                    distance_meters: act.distance,
                    duration_seconds: act.moving_time,
                    calories: act.calories || 0,
                    average_heartrate: act.average_heartrate,
                    max_heartrate: act.max_heartrate,
                    average_speed: act.average_speed,
                    total_elevation_gain: act.total_elevation_gain,
                    map_polyline: act.map?.summary_polyline
                }, { onConflict: 'strava_id' })

            if (upsertError) {
                console.error('Upsert Error for activity:', act.id, upsertError)
            } else {
                count++
            }
        }
        console.log(`Sincronização concluída: ${count} atividades processadas`)

        return new Response(JSON.stringify({ success: true, count, timestamp: new Date().toISOString() }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        console.error('Function Execution Error:', err)
        const error = err as Error
        return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})
