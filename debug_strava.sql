-- Diagnóstico Strava
-- Rode este script no SQL Editor do Supabase para verificar o estado atual

-- 1. Verifica se a coluna start_date_local existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'external_activities';

-- 2. Conta quantas atividades existem no total
SELECT COUNT(*) as total_activities FROM external_activities;

-- 3. Lista as últimas 5 atividades (se houver alguma)
SELECT 
  id,
  name,
  activity_type,
  start_date,
  start_date_local,
  distance_meters,
  duration_seconds,
  created_at
FROM external_activities 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. Verifica se o usuário atual tem strava_refresh_token
SELECT 
  id,
  display_name,
  strava_access_token IS NOT NULL as has_access_token,
  strava_refresh_token IS NOT NULL as has_refresh_token,
  strava_expires_at
FROM profiles 
WHERE strava_refresh_token IS NOT NULL;
