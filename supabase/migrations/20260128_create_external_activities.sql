-- Migração para criação da tabela de atividades externas (Strava)
-- Frequência, Duração, Intensidade e Volume

CREATE TABLE IF NOT EXISTS "public"."external_activities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "strava_id" "bigint" UNIQUE,
    "name" "text",
    "activity_type" "text", -- 'Run', 'Ride', 'Swim', etc.
    "start_date" timestamp with time zone,
    "distance_meters" float8 DEFAULT 0,
    "duration_seconds" integer DEFAULT 0,
    "calories" float8 DEFAULT 0,
    "average_heartrate" float8,
    "max_heartrate" float8,
    "average_speed" float8, -- em m/s
    "total_elevation_gain" float8 DEFAULT 0,
    "map_polyline" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    
    CONSTRAINT "external_activities_pkey" PRIMARY KEY ("id")
);

-- Ativa RLS
ALTER TABLE "public"."external_activities" ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Users can view their own external activities"
ON "public"."external_activities"
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own external activities"
ON "public"."external_activities"
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS "idx_external_activities_user_date" ON "public"."external_activities" ("user_id", "start_date" DESC);

-- Permissões
ALTER TABLE "public"."external_activities" OWNER TO "postgres";
GRANT ALL ON TABLE "public"."external_activities" TO "postgres";
GRANT ALL ON TABLE "public"."external_activities" TO "service_role";
GRANT ALL ON TABLE "public"."external_activities" TO "authenticated";
