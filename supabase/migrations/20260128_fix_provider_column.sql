-- Remove NOT NULL constraint da coluna provider ou adiciona um DEFAULT
ALTER TABLE "public"."external_activities" 
ALTER COLUMN "provider" SET DEFAULT 'strava';

-- Se a coluna provider não existir, cria ela com default
DO $$ 
BEGIN
    ALTER TABLE "public"."external_activities" 
    ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'strava';
EXCEPTION WHEN duplicate_column THEN
    -- Já existe, só garante o default
    ALTER TABLE "public"."external_activities" 
    ALTER COLUMN "provider" SET DEFAULT 'strava';
END $$;
