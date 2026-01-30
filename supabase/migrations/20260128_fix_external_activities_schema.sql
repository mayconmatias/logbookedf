-- Corrige o schema da tabela external_activities para bater com a Edge Function
-- Problema: colunas faltando ou com nomes errados

-- 1. Adiciona a coluna strava_id (se não existir) e cria unique constraint
ALTER TABLE "public"."external_activities" 
ADD COLUMN IF NOT EXISTS "strava_id" bigint;

-- Remove duplicate constraint se existir e adiciona novamente
DO $$ 
BEGIN
    -- Tenta remover constraint antigo se existir
    ALTER TABLE "public"."external_activities" DROP CONSTRAINT IF EXISTS "external_activities_strava_id_key";
    -- Adiciona constraint unique
    ALTER TABLE "public"."external_activities" ADD CONSTRAINT "external_activities_strava_id_key" UNIQUE ("strava_id");
EXCEPTION WHEN OTHERS THEN
    -- Ignora erro se já existir
    NULL;
END $$;

-- 2. Renomeia avg_heartrate para average_heartrate (se necessário)
DO $$ 
BEGIN
    ALTER TABLE "public"."external_activities" 
    RENAME COLUMN "avg_heartrate" TO "average_heartrate";
EXCEPTION WHEN undefined_column THEN
    -- Se avg_heartrate não existir, adiciona average_heartrate
    ALTER TABLE "public"."external_activities" 
    ADD COLUMN IF NOT EXISTS "average_heartrate" float8;
END $$;

-- 3. Adiciona colunas faltantes
ALTER TABLE "public"."external_activities" 
ADD COLUMN IF NOT EXISTS "max_heartrate" float8;

ALTER TABLE "public"."external_activities" 
ADD COLUMN IF NOT EXISTS "average_speed" float8;

ALTER TABLE "public"."external_activities" 
ADD COLUMN IF NOT EXISTS "total_elevation_gain" float8 DEFAULT 0;

ALTER TABLE "public"."external_activities" 
ADD COLUMN IF NOT EXISTS "map_polyline" text;

-- 4. Cria índice em strava_id para performance
CREATE INDEX IF NOT EXISTS "idx_external_activities_strava_id" 
ON "public"."external_activities" ("strava_id");
