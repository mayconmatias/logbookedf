-- Adiciona coluna start_date_local para garantir que atividades apareçam no dia local correto
ALTER TABLE "public"."external_activities" ADD COLUMN IF NOT EXISTS "start_date_local" timestamp with time zone;

-- Atualiza o índice para incluir a nova coluna (opcional, mas bom para performance de busca por data local)
CREATE INDEX IF NOT EXISTS "idx_external_activities_local_date" ON "public"."external_activities" ("user_id", "start_date_local" DESC);
