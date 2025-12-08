


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."set_type_enum" AS ENUM (
    'normal',
    'warmup',
    'drop',
    'rest_pause',
    'cluster',
    'biset',
    'triset'
);


ALTER TYPE "public"."set_type_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_program"("p_program_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Descobre quem é o dono do programa que queremos ativar
  SELECT student_id INTO v_owner_id FROM public.programs WHERE id = p_program_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Programa não encontrado.';
  END IF;

  -- Verifica segurança: Só o dono ou o coach dele pode ativar
  IF v_owner_id != auth.uid() AND NOT EXISTS (
     SELECT 1 FROM coaching_relationships 
     WHERE coach_id = auth.uid() AND student_id = v_owner_id AND status = 'active'
  ) THEN
     RAISE EXCEPTION 'Permissão negada.';
  END IF;

  -- TRANSAÇÃO ATÔMICA:
  -- 1. Desativa TODOS os programas desse aluno
  UPDATE public.programs
  SET is_active = false
  WHERE student_id = v_owner_id;

  -- 2. Ativa APENAS o programa solicitado
  UPDATE public.programs
  SET is_active = true
  WHERE id = p_program_id;
  
END;
$$;


ALTER FUNCTION "public"."activate_program"("p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analyze_workout_density"("p_workout_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_started_at timestamp;
  v_ended_at timestamp;
  v_first_set timestamp;
  v_last_set timestamp;
  v_total_sets int;
  v_total_volume_load float;
  v_active_minutes float;
  v_rest_avg_seconds float;
  v_density_score float;
  v_is_batch_log boolean;
BEGIN
  -- [CORREÇÃO] created_at
  SELECT created_at, ended_at INTO v_started_at, v_ended_at
  FROM workouts WHERE id = p_workout_id;

  SELECT 
    MIN(performed_at), MAX(performed_at), COUNT(*), SUM(weight * reps)
  INTO 
    v_first_set, v_last_set, v_total_sets, v_total_volume_load
  FROM sets 
  WHERE workout_id = p_workout_id AND weight > 0 AND reps > 0;

  IF v_total_sets IS NULL OR v_total_sets < 2 THEN
    RETURN json_build_object('status', 'insufficient_data');
  END IF;

  v_active_minutes := EXTRACT(EPOCH FROM (v_last_set - v_first_set)) / 60;

  IF v_active_minutes < 5 THEN
     v_is_batch_log := true;
     v_density_score := 0;
  ELSE
     v_is_batch_log := false;
     v_density_score := v_total_volume_load / v_active_minutes;
  END IF;

  IF v_is_batch_log = false THEN
     v_rest_avg_seconds := (v_active_minutes * 60) / (v_total_sets - 1);
  ELSE
     v_rest_avg_seconds := 0;
  END IF;

  RETURN json_build_object(
    'status', 'success',
    'total_sets', v_total_sets,
    'total_volume_kg', v_total_volume_load,
    'active_duration_minutes', ROUND(v_active_minutes::numeric, 1),
    'density_kg_per_min', ROUND(v_density_score::numeric, 1),
    'avg_rest_seconds', ROUND(v_rest_avg_seconds::numeric, 0),
    'is_real_time', NOT v_is_batch_log
  );
END;
$$;


ALTER FUNCTION "public"."analyze_workout_density"("p_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_exercise_pack"("p_pack_template_id" "uuid", "p_pack_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ex_rec RECORD;
BEGIN
  -- Itera sobre os exercícios planejados no template do pacote
  -- (Assumindo que você montou o pacote como um 'Program' no banco para facilitar a gestão)
  FOR v_ex_rec IN 
    SELECT ed.name, ed.video_url, ed.default_notes
    FROM public.planned_exercises pe
    JOIN public.planned_workouts pw ON pe.planned_workout_id = pw.id
    JOIN public.exercise_definitions ed ON pe.definition_id = ed.id
    WHERE pw.program_id = p_pack_template_id
  LOOP
    -- Insere ou Atualiza (Upsert) o exercício no catálogo do usuário
    -- Se o exercício já existe (pelo nome), APENAS adiciona a tag nova.
    INSERT INTO public.exercise_definitions (
      user_id, name, video_url, default_notes, tags
    ) VALUES (
      v_user_id, 
      v_ex_rec.name, 
      v_ex_rec.video_url, 
      v_ex_rec.default_notes, 
      ARRAY[p_pack_name] -- Começa com essa tag
    )
    ON CONFLICT (user_id, name_lowercase) 
    DO UPDATE SET
      -- Adiciona a tag ao array existente se ela ainda não estiver lá
      tags = CASE 
        WHEN NOT (public.exercise_definitions.tags @> ARRAY[p_pack_name]) 
        THEN public.exercise_definitions.tags || p_pack_name
        ELSE public.exercise_definitions.tags
      END;
      
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."buy_exercise_pack"("p_pack_template_id" "uuid", "p_pack_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new_program_id uuid;
  v_workout_rec RECORD;
  v_new_workout_id uuid;
  v_exercise_rec RECORD;
BEGIN
  -- A. REGRA DE NEGÓCIO: Só um ativo por vez.
  -- Desativa todos os programas existentes desse aluno antes de criar o novo.
  UPDATE public.programs
  SET is_active = false
  WHERE student_id = p_target_user_id;

  -- B. Copia o CABEÇALHO do Programa
  INSERT INTO public.programs (
    coach_id,
    student_id,
    name,
    description,
    is_active, -- O novo nasce ativo
    is_template,
    origin_template_id -- [NOVO] Rastreia de onde veio
  )
  SELECT
    p_target_user_id,
    p_target_user_id,
    name,
    description,
    true, 
    false,
    id -- O ID do template original
  FROM public.programs
  WHERE id = p_template_id
  RETURNING id INTO v_new_program_id;

  -- C. Copia os TREINOS (Mantém a lógica anterior)
  FOR v_workout_rec IN 
    SELECT * FROM public.planned_workouts 
    WHERE program_id = p_template_id 
    ORDER BY day_order ASC
  LOOP
    INSERT INTO public.planned_workouts (
      program_id, name, day_order
    ) VALUES (
      v_new_program_id, v_workout_rec.name, v_workout_rec.day_order
    ) RETURNING id INTO v_new_workout_id;

    -- D. Copia os EXERCÍCIOS (Mantém a lógica anterior)
    FOR v_exercise_rec IN 
      SELECT * FROM public.planned_exercises 
      WHERE planned_workout_id = v_workout_rec.id
      ORDER BY order_index ASC
    LOOP
      INSERT INTO public.planned_exercises (
        planned_workout_id, definition_id, order_index,
        sets_count, reps_range, rpe_target, rest_seconds, notes
      ) VALUES (
        v_new_workout_id, v_exercise_rec.definition_id, v_exercise_rec.order_index,
        v_exercise_rec.sets_count, v_exercise_rec.reps_range,
        v_exercise_rec.rpe_target, v_exercise_rec.rest_seconds, v_exercise_rec.notes
      );
    END LOOP;
  END LOOP;

  RETURN v_new_program_id;
END;
$$;


ALTER FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_system_exercises_to_user"("p_target_user_id" "uuid", "p_tag_filter" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_rec RECORD;
  v_count int := 0;
  v_skipped int := 0;
BEGIN
  -- Loop pelos exercícios do sistema (opcionalmente filtrados por tag/pacote)
  FOR v_rec IN 
    SELECT * FROM public.exercise_definitions 
    WHERE is_system = true
    AND (p_tag_filter IS NULL OR p_tag_filter = ANY(tags))
  LOOP
    
    -- Tenta inserir uma cópia para o usuário
    BEGIN
      INSERT INTO public.exercise_definitions (
        user_id, 
        name, 
        default_notes, 
        video_url, 
        type, 
        is_unilateral, 
        tags, 
        is_system, 
        origin_system_id -- Mantém o link com o original (bom para analytics futuros)
      ) VALUES (
        p_target_user_id,
        v_rec.name, -- Mantém o mesmo nome
        v_rec.default_notes,
        v_rec.video_url,
        v_rec.type,
        v_rec.is_unilateral,
        v_rec.tags, -- O usuário herda as tags do pacote
        false,      -- Agora é um exercício privado, não de sistema
        v_rec.id
      );
      
      v_count := v_count + 1;
      
    EXCEPTION WHEN unique_violation THEN
      -- Se o usuário já tem um exercício com esse nome, ignoramos (Pula)
      -- Isso evita duplicatas visuais irritantes com o mesmo nome
      v_skipped := v_skipped + 1;
    END;
    
  END LOOP;

  RETURN 'Clonados: ' || v_count || ', Pulados (Já existiam): ' || v_skipped;
END;
$$;


ALTER FUNCTION "public"."clone_system_exercises_to_user"("p_target_user_id" "uuid", "p_tag_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_autoral_program"("p_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan text;
  v_count integer;
  v_new_program_id uuid;
  v_new_program jsonb;
BEGIN
  -- 1. Verifica o plano do usuário
  SELECT subscription_plan INTO v_plan
  FROM public.profiles
  WHERE id = v_user_id;

  -- Se não tiver perfil, assume free
  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- 2. Conta quantos programas autorais o usuário já tem
  -- (Autorais são aqueles onde coach_id = student_id, e que não são templates comprados/clonados)
  SELECT COUNT(*) INTO v_count
  FROM public.programs
  WHERE student_id = v_user_id
    AND coach_id = v_user_id
    AND origin_template_id IS NULL; -- Garante que conta apenas os criados do zero

  -- 3. Aplica a Regra de Limite (Ex: Free = 1, Pro = Ilimitado)
  -- Você pode ajustar a lógica 'coach_pro' se tiver um plano 'athlete_pro' separado
  IF v_plan = 'free' AND v_count >= 1 THEN
    RAISE EXCEPTION 'Limite atingido: Usuários Free só podem criar 1 programa próprio.';
  END IF;

  -- 4. Insere o novo programa
  INSERT INTO public.programs (
    coach_id,
    student_id,
    name,
    is_active,
    is_template
  ) VALUES (
    v_user_id,
    v_user_id,
    TRIM(p_name),
    false, -- Cria inativo por padrão para não bagunçar a home
    false
  )
  RETURNING id INTO v_new_program_id;

  -- 5. Retorna o objeto criado para o front-end
  SELECT row_to_json(p) INTO v_new_program
  FROM public.programs p
  WHERE id = v_new_program_id;

  RETURN v_new_program;
END;
$$;


ALTER FUNCTION "public"."create_autoral_program"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.exercise_definitions
  WHERE id = p_definition_id
    AND user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_last_workout_date date;
  result_json jsonb;
BEGIN

  -- 1. Encontra a data do último treino
  SELECT
    w.workout_date INTO v_last_workout_date
  FROM
    public.workouts w
  JOIN
    public.exercises e ON e.workout_id = w.id
  WHERE
    w.user_id = v_user_id
    AND e.definition_id = p_definition_id
    AND (p_exclude_workout_id IS NULL OR w.id != p_exclude_workout_id)
  ORDER BY
    w.workout_date DESC
  LIMIT 1;

  -- 2. Constrói o JSON
  SELECT
    jsonb_build_object(
      'lastPerformance', (
        SELECT COALESCE(jsonb_agg(lp.* ORDER BY lp.set_number), '[]'::jsonb)
        FROM (
          SELECT
            s.id,
            s.set_number,
            s.weight,
            s.reps,
            s.rpe,
            s.observations,
            w.workout_date
          FROM
            public.sets s
          JOIN
            public.exercises e ON s.exercise_id = e.id
          JOIN
            public.workouts w ON e.workout_id = w.id
          WHERE
            w.user_id = v_user_id
            AND e.definition_id = p_definition_id
            AND w.workout_date = v_last_workout_date
        ) lp
      ),
      
      -- [CORREÇÃO AQUI]: Alterado de s.weight > 0 para s.weight >= 0
      'bestPerformance', (
        SELECT row_to_json(bp)
        FROM (
          SELECT
            s.id, s.weight, s.reps, s.rpe, s.observations, w.workout_date,
            (s.weight * power(1 + (0.032 * s.reps), 0.90)) AS e1rm
          FROM
            public.sets s
          JOIN
            public.exercises e ON s.exercise_id = e.id
          JOIN
            public.workouts w ON e.workout_id = w.id
          WHERE
            w.user_id = v_user_id
            AND e.definition_id = p_definition_id
            AND s.reps > 0 
            AND s.weight >= 0 -- CORRIGIDO
            AND (p_exclude_workout_id IS NULL OR w.id != p_exclude_workout_id)
          ORDER BY
            e1rm DESC, s.weight DESC
          LIMIT 1
        ) bp
      ),
      
      'historicalPRs', jsonb_build_object(
        'repPRs', (
          SELECT COALESCE(jsonb_agg(rpr.*), '[]'::jsonb)
          FROM (
            SELECT
              e.definition_id,
              s.weight,
              MAX(s.reps)::int AS max_reps
            FROM sets AS s
            JOIN exercises AS e ON s.exercise_id = e.id
            JOIN workouts AS w ON e.workout_id = w.id
            WHERE
              w.user_id = v_user_id
              AND e.definition_id = p_definition_id
              AND (p_exclude_workout_id IS NULL OR e.workout_id != p_exclude_workout_id)
            GROUP BY
              e.definition_id, s.weight
          ) rpr
        ),
        'weightPRs', (
          SELECT COALESCE(jsonb_agg(wpr.*), '[]'::jsonb)
          FROM (
            SELECT
              e.definition_id,
              MAX(s.weight) AS max_weight
            FROM sets AS s
            JOIN exercises AS e ON s.exercise_id = e.id
            JOIN workouts AS w ON e.workout_id = w.id
            WHERE
              w.user_id = v_user_id
              AND e.definition_id = p_definition_id
              AND (p_exclude_workout_id IS NULL OR e.workout_id != p_exclude_workout_id)
            GROUP BY
              e.definition_id
          ) wpr
        )
      )
    )
  INTO
    result_json;

  RETURN result_json;
END;
$$;


ALTER FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_global_tags_for_name"("p_name" "text") RETURNS TABLE("tags" "text"[], "is_verified" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ed.tags, 
    ed.is_verified
  FROM exercise_definitions ed
  WHERE 
    ed.name_lowercase = lower(trim(p_name)) -- Busca pelo nome exato (normalizado)
    AND ed.tags IS NOT NULL 
    AND array_length(ed.tags, 1) > 0 -- Garante que tem tags
  ORDER BY 
    ed.is_system DESC,   -- Prioridade 1: Exercícios do Sistema
    ed.is_verified DESC, -- Prioridade 2: Exercícios Validados por humanos
    ed.created_at DESC   -- Prioridade 3: O mais recente
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."find_global_tags_for_name"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") RETURNS TABLE("date" "text", "value" real)
    LANGUAGE "sql" STABLE
    AS $$
  WITH session_volumes AS (
    SELECT
      w.workout_date,
      SUM(s.weight * s.reps) AS session_volume
    FROM
      sets s
      JOIN exercises e ON s.exercise_id = e.id
      JOIN workouts w ON e.workout_id = w.id
    WHERE
      e.definition_id = p_definition_id
      AND w.user_id = auth.uid()
      AND s.set_type != 'warmup' -- [NOVO] Ignora aquecimento
      AND s.weight > 0 AND s.reps > 0
    GROUP BY
      w.workout_date
  ),
  cumulative_volumes AS (
    SELECT
      sv.workout_date::text AS date,
      SUM(sv.session_volume) OVER (ORDER BY sv.workout_date ASC)::real AS value
    FROM
      session_volumes sv
  )
  SELECT * FROM cumulative_volumes
  ORDER BY date ASC;
$$;


ALTER FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"("p_set_types" "text"[] DEFAULT ARRAY['normal'::"text", 'drop'::"text", 'rest_pause'::"text", 'cluster'::"text", 'biset'::"text", 'triset'::"text"], "p_program_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tag_stats json;
  v_exercise_stats json;
  v_evolution_trend json;
  v_evolution_daily json;
  v_last_checkin json;
  v_time_stats json;
  v_current_streak int;
  
  -- Variáveis para os novos cards
  v_sets_min int;
  v_sets_max int;
  v_rest_p25 int;
  v_rest_p75 int;

  v_valid_muscles text[] := ARRAY[
    'Peito', 'Costas', 'Ombros', 'Quadríceps', 'Posterior', 
    'Glúteos', 'Bíceps', 'Tríceps', 'Panturrilhas', 'Abdômen', 
    'Antebraço', 'Trapézio', 'Adutores', 'Abdutores', 'Cardio', 'Full Body'
  ];
BEGIN

  -- 1. ESTATÍSTICAS POR TAG
  WITH raw_data AS (
    SELECT 
      INITCAP(unnest(ed.tags)) as tag,
      s.id as set_id,
      date_trunc('week', w.workout_date) as week_start,
      CASE WHEN w.workout_date >= (CURRENT_DATE - INTERVAL '7 days') THEN 1 ELSE 0 END as is_recent
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN exercise_definitions ed ON e.definition_id = ed.id
    JOIN workouts w ON e.workout_id = w.id
    LEFT JOIN planned_workouts pw ON w.planned_workout_id = pw.id
    WHERE w.user_id = v_user_id
      AND w.workout_date >= (CURRENT_DATE - INTERVAL '90 days')
      AND (s.weight > 0 OR s.reps > 0)
      AND (COALESCE(s.set_type::text, 'normal') = ANY(p_set_types))
      AND (p_program_id IS NULL OR pw.program_id = p_program_id)
  ),
  grouped_tags AS (
    SELECT 
      tag, 
      COUNT(set_id) as total_sets_90d,
      COUNT(DISTINCT week_start) as active_weeks,
      SUM(is_recent) as last_week_sets
    FROM raw_data
    WHERE tag = ANY(v_valid_muscles)
    GROUP BY tag
  )
  SELECT json_agg(json_build_object(
    'label', tag, 
    'weekly_sets', ROUND((total_sets_90d::numeric / NULLIF(active_weeks, 0)), 1),
    'last_week_sets', last_week_sets
  )) INTO v_tag_stats FROM (SELECT * FROM grouped_tags ORDER BY last_week_sets DESC, total_sets_90d DESC) t;

  -- 2. ESTATÍSTICAS POR EXERCÍCIO
  WITH raw_data_ex AS (
    SELECT 
      ed.name as exercise_name,
      s.id as set_id,
      date_trunc('week', w.workout_date) as week_start,
      CASE WHEN w.workout_date >= (CURRENT_DATE - INTERVAL '7 days') THEN 1 ELSE 0 END as is_recent
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN exercise_definitions ed ON e.definition_id = ed.id
    JOIN workouts w ON e.workout_id = w.id
    LEFT JOIN planned_workouts pw ON w.planned_workout_id = pw.id
    WHERE w.user_id = v_user_id
      AND w.workout_date >= (CURRENT_DATE - INTERVAL '90 days')
      AND (s.weight > 0 OR s.reps > 0)
      AND (COALESCE(s.set_type::text, 'normal') = ANY(p_set_types))
      AND (p_program_id IS NULL OR pw.program_id = p_program_id)
  ),
  grouped_exercises AS (
    SELECT 
      exercise_name,
      COUNT(set_id) as total_sets_90d,
      COUNT(DISTINCT week_start) as active_weeks,
      SUM(is_recent) as last_week_sets
    FROM raw_data_ex
    GROUP BY exercise_name
  )
  SELECT json_agg(json_build_object(
    'label', exercise_name, 
    'weekly_sets', ROUND((total_sets_90d::numeric / NULLIF(active_weeks, 0)), 1),
    'last_week_sets', last_week_sets
  )) INTO v_exercise_stats FROM (SELECT * FROM grouped_exercises ORDER BY last_week_sets DESC, total_sets_90d DESC LIMIT 20) t;

  -- 3. EVOLUÇÃO SEMANAL
  WITH weekly_stats AS (
    SELECT 
      date_trunc('week', w.workout_date)::date as week_start,
      SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) as total_volume,
      COUNT(s.id) as total_sets,
      CASE 
        WHEN SUM(EXTRACT(EPOCH FROM (w.ended_at - w.created_at))/60) > 0 
        THEN SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) / SUM(EXTRACT(EPOCH FROM (w.ended_at - w.created_at))/60)
        ELSE 0 
      END as density
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN workouts w ON e.workout_id = w.id
    LEFT JOIN planned_workouts pw ON w.planned_workout_id = pw.id
    WHERE w.user_id = v_user_id
      AND w.workout_date >= (CURRENT_DATE - INTERVAL '12 weeks')
      AND (COALESCE(s.set_type::text, 'normal') = ANY(p_set_types))
      AND (p_program_id IS NULL OR pw.program_id = p_program_id)
    GROUP BY week_start
    ORDER BY week_start ASC
  )
  SELECT json_agg(json_build_object(
    'date', week_start, 
    'volume', total_volume,
    'sets', total_sets,
    'density', ROUND(density::numeric, 1)
  )) INTO v_evolution_trend FROM weekly_stats;

  -- 4. EVOLUÇÃO DIÁRIA
  WITH daily_stats AS (
    SELECT 
      w.workout_date as workout_day,
      SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) as total_volume,
      COUNT(s.id) as total_sets,
      CASE 
        WHEN SUM(EXTRACT(EPOCH FROM (w.ended_at - w.created_at))/60) > 0 
        THEN SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) / SUM(EXTRACT(EPOCH FROM (w.ended_at - w.created_at))/60)
        ELSE 0 
      END as density
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN workouts w ON e.workout_id = w.id
    LEFT JOIN planned_workouts pw ON w.planned_workout_id = pw.id
    WHERE w.user_id = v_user_id
      AND w.workout_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND (COALESCE(s.set_type::text, 'normal') = ANY(p_set_types))
      AND (p_program_id IS NULL OR pw.program_id = p_program_id)
    GROUP BY w.workout_date
    ORDER BY w.workout_date ASC
  )
  SELECT json_agg(json_build_object(
    'date', workout_day, 
    'volume', total_volume,
    'sets', total_sets,
    'density', ROUND(density::numeric, 1)
  )) INTO v_evolution_daily FROM daily_stats;

  -- 5. HIGHLIGHTS (SETS & REST) -- [CORREÇÃO AQUI]
  
  -- Cálculo de Séries por Sessão
  WITH sets_per_session AS (
    SELECT w.id, COUNT(s.id) as set_count
    FROM workouts w
    JOIN exercises e ON e.workout_id = w.id
    JOIN sets s ON s.exercise_id = e.id
    WHERE w.user_id = v_user_id 
      AND w.workout_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND (s.weight > 0 OR s.reps > 0)
    GROUP BY w.id
  )
  SELECT MIN(set_count), MAX(set_count) INTO v_sets_min, v_sets_max
  FROM sets_per_session;

  -- Cálculo de Descanso (JOIN CORRIGIDO)
  WITH set_intervals AS (
    SELECT 
      e.workout_id, -- Pegamos do exercício, não do set
      s.performed_at,
      LAG(s.performed_at) OVER (PARTITION BY e.workout_id ORDER BY s.performed_at) as prev_time
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id -- JOIN CORRETO
    JOIN workouts w ON e.workout_id = w.id
    WHERE w.user_id = v_user_id 
      AND w.workout_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND s.performed_at IS NOT NULL
  ),
  diffs AS (
    SELECT EXTRACT(EPOCH FROM (performed_at - prev_time)) as seconds
    FROM set_intervals
    WHERE prev_time IS NOT NULL
  )
  SELECT 
    percentile_cont(0.25) WITHIN GROUP (ORDER BY seconds),
    percentile_cont(0.75) WITHIN GROUP (ORDER BY seconds)
  INTO v_rest_p25, v_rest_p75
  FROM diffs
  WHERE seconds BETWEEN 10 AND 600;

  -- Tempo Médio
  WITH time_calc AS (
    SELECT 
      AVG(EXTRACT(EPOCH FROM (ended_at - created_at))/60) as avg_minutes
    FROM workouts
    WHERE user_id = v_user_id 
      AND workout_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND ended_at IS NOT NULL
  )
  SELECT json_build_object(
    'avg_session_minutes', COALESCE((SELECT avg_minutes FROM time_calc), 0),
    'sets_min', COALESCE(v_sets_min, 0),
    'sets_max', COALESCE(v_sets_max, 0),
    'rest_min_seconds', COALESCE(v_rest_p25, 0),
    'rest_max_seconds', COALESCE(v_rest_p75, 0)
  ) INTO v_time_stats;

  SELECT row_to_json(c) INTO v_last_checkin
  FROM daily_checkins c WHERE c.user_id = v_user_id ORDER BY c.date DESC LIMIT 1;

  -- STREAK
  WITH weekly_activity AS (
    SELECT DISTINCT date_trunc('week', workout_date)::date as active_week
    FROM workouts
    WHERE user_id = v_user_id
    ORDER BY active_week DESC
  ),
  streak_groups AS (
    SELECT 
      active_week,
      active_week - (ROW_NUMBER() OVER (ORDER BY active_week DESC) * INTERVAL '1 week') as grp
    FROM weekly_activity
  )
  SELECT COUNT(*) INTO v_current_streak
  FROM streak_groups
  WHERE grp = (SELECT grp FROM streak_groups LIMIT 1);

  RETURN json_build_object(
    'tag_stats', COALESCE(v_tag_stats, '[]'::json),
    'exercise_stats', COALESCE(v_exercise_stats, '[]'::json),
    'evolution_trend', COALESCE(v_evolution_trend, '[]'::json),
    'evolution_daily', COALESCE(v_evolution_daily, '[]'::json),
    'time_stats', v_time_stats,
    'last_checkin', v_last_checkin,
    'current_streak', COALESCE(v_current_streak, 0),
    'consistency_matrix', (SELECT json_agg(workout_date) FROM workouts WHERE user_id = v_user_id AND workout_date >= (CURRENT_DATE - INTERVAL '90 days'))
  );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_stats"("p_set_types" "text"[], "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_email_by_cpf"("p_cpf" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE 
  v_email text;
  v_cpf_clean text;
BEGIN
  -- Remove tudo que não for número
  v_cpf_clean := regexp_replace(p_cpf, '\D', '', 'g');

  -- Se não tiver 11 dígitos, nem busca (economiza banco)
  IF length(v_cpf_clean) != 11 THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email
  FROM public.profiles
  WHERE cpf = p_cpf -- Mantemos a busca original, assumindo que no banco está salvo formatado ou limpo conforme sua lógica de cadastro
  LIMIT 1;

  RETURN v_email;
END;
$$;


ALTER FUNCTION "public"."get_email_by_cpf"("p_cpf" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exercise_analytics"("p_definition_id" "uuid", "p_target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid;
  v_is_verified boolean;
  v_tags text[];
  result_json jsonb;
BEGIN
  IF p_target_user_id IS NULL THEN
    v_user_id := auth.uid();
  ELSE
    v_user_id := p_target_user_id;
  END IF;

  -- Busca informações de verificação
  SELECT is_verified, tags INTO v_is_verified, v_tags
  FROM exercise_definitions WHERE id = p_definition_id;

  WITH 
  raw_sets AS (
    SELECT
      s.id,
      s.weight,
      s.reps,
      w.workout_date,
      w.ended_at,
      COALESCE(s.weight, 0) as safe_weight,
      COALESCE(s.reps, 0) as safe_reps
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN workouts w ON e.workout_id = w.id
    WHERE
      w.user_id = v_user_id
      AND e.definition_id = p_definition_id
      AND s.set_type != 'warmup'
      AND s.weight > 0 AND s.reps > 0
  ),
  calculated_sets AS (
    SELECT
      *,
      (safe_weight * power(1 + (0.032 * safe_reps), 0.9))::numeric(10, 2) AS e1rm,
      (safe_weight * safe_reps) AS set_volume
    FROM raw_sets
  ),
  history_sets AS (
    SELECT * FROM calculated_sets 
    WHERE ended_at IS NOT NULL 
    AND workout_date < CURRENT_DATE
  ),
  session_maxes AS (
    SELECT workout_date, MAX(e1rm) as max_e1rm
    FROM history_sets
    GROUP BY workout_date
  ),
  streak_calc AS (
    SELECT workout_date, max_e1rm,
      CASE WHEN max_e1rm > LAG(max_e1rm, 1, 0) OVER (ORDER BY workout_date ASC) THEN 1 ELSE 0 END as is_gain
    FROM session_maxes
  ),
  final_streak AS (
    SELECT COUNT(*) as streak
    FROM ( SELECT is_gain, ROW_NUMBER() OVER (ORDER BY workout_date DESC) as rn FROM streak_calc ) t
    WHERE is_gain = 1 
    AND rn <= ( SELECT COALESCE(MIN(rn), 999) - 1 FROM ( SELECT is_gain, ROW_NUMBER() OVER (ORDER BY workout_date DESC) as rn FROM streak_calc ) x WHERE is_gain = 0 )
  )
  SELECT jsonb_build_object(
    'is_verified', COALESCE(v_is_verified, false),
    'tags', COALESCE(v_tags, '{}'::text[]),
    'prStreakCount', (SELECT COALESCE(streak, 0) FROM final_streak),
    'daysSinceLastPR', (SELECT COALESCE(CURRENT_DATE - MAX(workout_date), 0) FROM history_sets),
    'bestSetAllTime', (SELECT row_to_json(t) FROM (SELECT workout_date as date, weight, reps, e1rm FROM calculated_sets ORDER BY e1rm DESC, weight DESC LIMIT 1) t),
    'bestSetPreviousSession', (SELECT row_to_json(t) FROM (SELECT workout_date as date, weight, reps, e1rm FROM history_sets ORDER BY workout_date DESC, e1rm DESC LIMIT 1) t),
    'historicalPRsList', (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT workout_date as date, weight, reps, e1rm FROM history_sets ORDER BY workout_date DESC LIMIT 10) t),
    'chartDataE1RM', (SELECT COALESCE(json_agg(json_build_object('date', workout_date, 'value', max_e1rm)), '[]'::json) FROM (SELECT workout_date, MAX(e1rm) as max_e1rm FROM calculated_sets GROUP BY workout_date ORDER BY workout_date ASC) sub),
    'chartDataAccumulatedVolume', (SELECT COALESCE(json_agg(json_build_object('date', workout_date, 'value', vol)), '[]'::json) FROM (SELECT workout_date, SUM(set_volume) as vol FROM calculated_sets GROUP BY workout_date ORDER BY workout_date ASC) sub),
    'calendarData', (SELECT COALESCE(json_agg(json_build_object('date', workout_date, 'is_pr', false)), '[]'::json) FROM (SELECT DISTINCT workout_date FROM calculated_sets) sub)
  ) INTO result_json;

  RETURN result_json;
END;
$$;


ALTER FUNCTION "public"."get_exercise_analytics"("p_definition_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exercise_set_history"("p_definition_id" "uuid") RETURNS TABLE("workout_date" "date", "set_number" integer, "weight" real, "reps" integer, "is_pr" boolean)
    LANGUAGE "sql" STABLE
    AS $$
  WITH all_sets_ordered AS (
    SELECT
      w.workout_date,
      s.set_number,
      s.weight,
      s.reps,
      s.performed_at,
      (s.weight * power(1 + (0.032 * s.reps), 0.90)) AS e1rm
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN workouts w ON e.workout_id = w.id
    WHERE
      w.user_id = auth.uid()
      AND e.definition_id = p_definition_id
      AND s.weight >= 0 -- [CORREÇÃO AQUI]
      AND s.reps > 0
    ORDER BY
      w.workout_date ASC, 
      s.performed_at ASC NULLS LAST,
      s.set_number ASC
  ),
  sets_with_pr_check AS (
    SELECT
      *,
      COALESCE(
        MAX(e1rm) OVER (
          ORDER BY workout_date ASC, performed_at ASC NULLS LAST, set_number ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ) AS max_e1rm_before
    FROM
      all_sets_ordered
  )
  SELECT
    s.workout_date::date,
    s.set_number::int,
    s.weight::real,
    s.reps::int,
    (s.e1rm > s.max_e1rm_before) AS is_pr
  FROM
    sets_with_pr_check s 
  ORDER BY
    s.workout_date ASC, s.performed_at ASC NULLS LAST, s.set_number ASC;
$$;


ALTER FUNCTION "public"."get_exercise_set_history"("p_definition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_historical_rep_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") RETURNS TABLE("definition_id" "uuid", "weight" numeric, "max_reps" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.definition_id,
    s.weight,
    MAX(s.reps)::int AS max_reps
  FROM sets AS s
  JOIN exercises AS e ON s.exercise_id = e.id
  JOIN workouts AS w ON e.workout_id = w.id
  WHERE
    w.user_id = auth.uid()
    AND e.definition_id = ANY(p_definition_ids)
    AND e.workout_id != p_exclude_workout_id
  GROUP BY
    e.definition_id, s.weight;
END;
$$;


ALTER FUNCTION "public"."get_historical_rep_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_historical_weight_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") RETURNS TABLE("definition_id" "uuid", "max_weight" numeric)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.definition_id,
    MAX(s.weight) AS max_weight
  FROM sets AS s
  JOIN exercises AS e ON s.exercise_id = e.id
  JOIN workouts AS w ON e.workout_id = w.id
  WHERE
    w.user_id = auth.uid()
    AND e.definition_id = ANY(p_definition_ids)
    AND e.workout_id != p_exclude_workout_id
  GROUP BY
    e.definition_id;
END;
$$;


ALTER FUNCTION "public"."get_historical_weight_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_most_recent_workout"() RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id,
    w.created_at -- Usamos created_at para precisão de hora
  FROM workouts AS w
  WHERE
    w.user_id = auth.uid()
  ORDER BY
    w.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_most_recent_workout"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_exercise_in_workout"("p_workout_id" "uuid", "p_definition_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_exercise_instance_id uuid;
  v_next_order integer;
BEGIN
  -- 1. Tenta encontrar a instância do exercício DENTRO deste workout
  SELECT id INTO v_exercise_instance_id
  FROM public.exercises
  WHERE
    workout_id = p_workout_id
    AND definition_id = p_definition_id
  LIMIT 1;

  -- 2. Se encontrou, retorna o ID da instância
  IF v_exercise_instance_id IS NOT NULL THEN
    RETURN v_exercise_instance_id;
  END IF;

  -- 3. Se não encontrou, descobre qual a próxima ordem (Max + 1)
  -- Isso evita que exercícios novos "furem a fila" e apareçam no topo
  SELECT COALESCE(MAX(order_in_workout), -1) + 1 INTO v_next_order
  FROM public.exercises
  WHERE workout_id = p_workout_id;

  -- 4. Cria a nova instância com a ordem correta
  INSERT INTO public.exercises (workout_id, definition_id, order_in_workout)
  VALUES (p_workout_id, p_definition_id, v_next_order)
  RETURNING id INTO v_exercise_instance_id;
  
  RETURN v_exercise_instance_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_exercise_in_workout"("p_workout_id" "uuid", "p_definition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profile_summary_by_email"("p_email" "text") RETURNS TABLE("id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select p.id, p.display_name
  from public.profiles p
  where lower(p.email) = lower(p_email); -- Busca exata, ignorando maiúsculas/minúsculas
end;
$$;


ALTER FUNCTION "public"."get_profile_summary_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_unique_exercises"("p_student_id" "uuid") RETURNS TABLE("definition_id" "uuid", "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Verifica segurança: Sou coach dele?
  if not exists (
    select 1 from coaching_relationships 
    where coach_id = auth.uid() 
    and student_id = p_student_id
    and status = 'active'
  ) then
     -- Retorna vazio ou erro se não for coach (segurança silenciosa)
     return; 
  end if;

  return query
  select distinct def.id, def.name
  from exercises e
  join workouts w on e.workout_id = w.id
  join exercise_definitions def on e.definition_id = def.id
  where w.user_id = p_student_id
  order by def.name;
end;
$$;


ALTER FUNCTION "public"."get_student_unique_exercises"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unique_exercise_catalog"() RETURNS TABLE("exercise_id" "uuid", "exercise_name_capitalized" "text", "exercise_name_lowercase" "text", "last_performed" "date", "total_sets" bigint, "is_system" boolean, "video_url" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_user_plan text;
BEGIN
  -- Pega plano do usuário
  SELECT subscription_plan INTO v_user_plan FROM public.profiles WHERE id = auth.uid();
  IF v_user_plan IS NULL THEN v_user_plan := 'free'; END IF;

  RETURN QUERY
  WITH set_data AS (
    SELECT
      e.definition_id,
      COUNT(s.id) as total_sets,
      MAX(w.workout_date) as last_performed
    FROM
      public.sets s
    JOIN public.exercises e ON s.exercise_id = e.id
    JOIN public.workouts w ON e.workout_id = w.id
    WHERE w.user_id = auth.uid()
    GROUP BY e.definition_id
  )
  SELECT
    ed.id as exercise_id,
    ed.name as exercise_name_capitalized,
    ed.name_lowercase as exercise_name_lowercase,
    sd.last_performed,
    COALESCE(sd.total_sets, 0) as total_sets,
    COALESCE(ed.is_system, false) as is_system,
    ed.video_url
  FROM
    public.exercise_definitions ed
  LEFT JOIN
    set_data sd ON ed.id = sd.definition_id
  WHERE
    -- 1. Exercícios do Próprio Usuário
    ed.user_id = auth.uid()
    OR
    -- 2. Exercícios do Sistema
    (
      ed.is_system = true 
    )
  ORDER BY
    -- Prioriza exercícios do sistema se tiver nomes parecidos, ou vice-versa
    ed.name ASC;
END;
$$;


ALTER FUNCTION "public"."get_unique_exercise_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workout_data_grouped"("p_workout_id" "uuid") RETURNS TABLE("id" "uuid", "definition_id" "uuid", "name" "text", "sets" json)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- 1. Verifica dono
  SELECT w.user_id INTO v_owner_id 
  FROM workouts w
  WHERE w.id = p_workout_id;

  IF v_owner_id IS NULL THEN RETURN; END IF;

  -- 2. Segurança
  IF v_owner_id != auth.uid() THEN
     IF NOT EXISTS (
        SELECT 1 FROM coaching_relationships cr
        WHERE cr.coach_id = auth.uid() AND cr.student_id = v_owner_id AND cr.status = 'active'
     ) THEN
        RAISE EXCEPTION 'Acesso negado.';
     END IF;
  END IF;

  -- 3. Query Principal (COM ORDENAÇÃO FORÇADA DE AQUECIMENTO)
  RETURN QUERY
  SELECT
    e.id,
    e.definition_id,
    def.name,
    COALESCE(
      json_agg(
        json_build_object(
          'id', s.id,
          'exercise_id', s.exercise_id,
          'set_number', s.set_number,
          'weight', s.weight,
          'reps', s.reps,
          'rpe', s.rpe,
          'observations', s.observations,
          'side', s.side,
          'performed_at', s.performed_at,
          'set_type', s.set_type,
          'parent_set_id', s.parent_set_id,
          'super_set_id', s.super_set_id
        ) ORDER BY 
          -- [CORREÇÃO CRÍTICA]: Warmup sempre tem prioridade 0 (topo), outros tem 1
          (CASE WHEN s.set_type = 'warmup' THEN 0 ELSE 1 END) ASC,
          -- Desempate pelo número da série
          s.set_number ASC
      ) FILTER (WHERE s.id IS NOT NULL),
      '[]'::json
    ) AS sets
  FROM exercises e
  JOIN exercise_definitions def ON e.definition_id = def.id
  LEFT JOIN sets s ON s.exercise_id = e.id
  WHERE e.workout_id = p_workout_id
  GROUP BY e.id, e.definition_id, def.name, e.order_in_workout
  ORDER BY e.order_in_workout ASC, min(e.created_at) ASC;
END;
$$;


ALTER FUNCTION "public"."get_workout_data_grouped"("p_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workout_date_by_id"("p_workout_id" "uuid") RETURNS "date"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT workout_date
  FROM public.workouts
  WHERE id = p_workout_id
  AND user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_workout_date_by_id"("p_workout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, cpf, display_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'cpf', -- Pega o CPF enviado pelo App
    split_part(new.email, '@', 1)    -- Cria um nome provisório baseado no email
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_with_cpf"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Insere na tabela 'profiles' o ID, o CPF (lido dos metadados) e o E-mail
  INSERT INTO public.profiles (id, cpf, email)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'cpf', -- Pega o 'cpf' dos metadados
    new.email
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_with_cpf"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_bridge_owner"("p_workout_id" "uuid", "p_definition_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_workout_owner_id uuid;
  v_definition_owner_id uuid;
BEGIN
  -- 1. Pega o dono do Workout
  SELECT user_id INTO v_workout_owner_id
  FROM public.workouts
  WHERE id = p_workout_id;

  -- 2. Pega o dono da Definição
  SELECT user_id INTO v_definition_owner_id
  FROM public.exercise_definitions
  WHERE id = p_definition_id;

  -- 3. Compara AMBOS com o usuário logado
  RETURN v_workout_owner_id = auth.uid() AND v_definition_owner_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."is_user_bridge_owner"("p_workout_id" "uuid", "p_definition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_exercise_definitions"("p_old_definition_id" "uuid", "p_target_definition_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exercise_definitions
    WHERE id = p_old_definition_id AND user_id = v_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.exercise_definitions
    WHERE id = p_target_definition_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Exercícios não encontrados ou não pertencem ao usuário.';
  END IF;

  UPDATE public.exercises
  SET definition_id = p_target_definition_id
  WHERE definition_id = p_old_definition_id;
  
  DELETE FROM public.exercise_definitions
  WHERE id = p_old_definition_id;
END;
$$;


ALTER FUNCTION "public"."merge_exercise_definitions"("p_old_definition_id" "uuid", "p_target_definition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_exercise_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid;
  v_def_id uuid;
  v_stats record;
BEGIN
  -- Identificar User e Definition afetados
  IF (TG_OP = 'DELETE') THEN
    -- Precisamos buscar a definition_id antes de perder a referência da série
    SELECT e.definition_id, w.user_id INTO v_def_id, v_user_id
    FROM exercises e JOIN workouts w ON e.workout_id = w.id
    WHERE e.id = OLD.exercise_id;
  ELSE
    SELECT e.definition_id, w.user_id INTO v_def_id, v_user_id
    FROM exercises e JOIN workouts w ON e.workout_id = w.id
    WHERE e.id = NEW.exercise_id;
  END IF;

  -- Se não achou (ex: treino deletado em cascata), sai
  IF v_user_id IS NULL OR v_def_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calcular Estatísticas Agregadas
  WITH raw_stats AS (
    SELECT
      MAX(s.weight) as max_w,
      MAX(s.weight * POWER(1 + (0.032 * s.reps), 0.90)) as max_e,
      COUNT(s.id) as total_s,
      MAX(s.performed_at) as last_p
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN workouts w ON e.workout_id = w.id
    WHERE e.definition_id = v_def_id 
      AND w.user_id = v_user_id
      AND s.weight >= 0 
      AND s.reps > 0
  ),
  reps_map AS (
    -- Cria um JSON com o máximo de reps para cada peso
    SELECT jsonb_object_agg(weight::text, max_reps) as r_map
    FROM (
      SELECT s.weight, MAX(s.reps) as max_reps
      FROM sets s
      JOIN exercises e ON s.exercise_id = e.id
      JOIN workouts w ON e.workout_id = w.id
      WHERE e.definition_id = v_def_id AND w.user_id = v_user_id
      GROUP BY s.weight
    ) sub
  )
  SELECT 
    COALESCE(rs.max_w, 0) as mw,
    COALESCE(rs.max_e, 0) as me,
    COALESCE(rs.total_s, 0) as ts,
    rs.last_p as lp,
    COALESCE(rm.r_map, '{}'::jsonb) as rmap
  INTO v_stats
  FROM raw_stats rs
  CROSS JOIN reps_map rm;

  -- Atualizar ou Inserir na tabela de estatísticas
  INSERT INTO public.exercise_statistics (
    user_id, definition_id, max_weight, max_e1rm, total_sets, last_performed, max_reps_by_weight, updated_at
  ) VALUES (
    v_user_id, v_def_id, v_stats.mw, v_stats.me, v_stats.ts, v_stats.lp, v_stats.rmap, now()
  )
  ON CONFLICT (user_id, definition_id) 
  DO UPDATE SET
    max_weight = EXCLUDED.max_weight,
    max_e1rm = EXCLUDED.max_e1rm,
    total_sets = EXCLUDED.total_sets,
    last_performed = EXCLUDED.last_performed,
    max_reps_by_weight = EXCLUDED.max_reps_by_weight,
    updated_at = now();

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."recalc_exercise_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_name_lowercase text := lower(p_new_name);
  v_existing_id uuid;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.exercise_definitions
  WHERE user_id = v_user_id
    AND name_lowercase = v_new_name_lowercase
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Um exercício com este nome já existe.';
  END IF;

  UPDATE public.exercise_definitions
  SET name = p_new_name
  WHERE id = p_definition_id
    AND user_id = v_user_id;
END;
$$;


ALTER FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_exercises"("p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  item jsonb;
BEGIN
  -- Itera sobre o array JSON recebido
  FOR item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    -- Atualiza o índice de ordem de cada exercício
    UPDATE public.exercises
    SET order_in_workout = (item->>'order')::int
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reorder_exercises"("p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_planned_exercises"("p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE public.planned_exercises
    SET order_index = (item->>'order')::int
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reorder_planned_exercises"("p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
new.updated_at := now();
return new;
end; $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."coaching_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "relationship_id" "uuid" NOT NULL,
    "sender_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coaching_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "coaching_relationships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."coaching_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "source_routine" smallint NOT NULL,
    "source_sleep" smallint NOT NULL,
    "symptom_energy" smallint NOT NULL,
    "symptom_motivation" smallint NOT NULL,
    "symptom_focus" smallint NOT NULL,
    "total_score" smallint GENERATED ALWAYS AS ((((("source_routine" + "source_sleep") + "symptom_energy") + "symptom_motivation") + "symptom_focus")) STORED,
    "ai_insight" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "name" "text" NOT NULL,
    "name_lowercase" "text" GENERATED ALWAYS AS ("lower"("name")) STORED,
    "default_notes" "text",
    "video_url" "text",
    "type" "text" DEFAULT 'strength'::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_unilateral" boolean DEFAULT false,
    "is_system" boolean DEFAULT false,
    "origin_system_id" "uuid",
    "is_verified" boolean DEFAULT false,
    "verification_votes" integer DEFAULT 0,
    CONSTRAINT "exercise_definitions_type_check" CHECK (("type" = ANY (ARRAY['strength'::"text", 'cardio'::"text", 'isometric'::"text"])))
);


ALTER TABLE "public"."exercise_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_statistics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "definition_id" "uuid" NOT NULL,
    "max_weight" numeric(6,2) DEFAULT 0,
    "max_e1rm" numeric(6,2) DEFAULT 0,
    "total_sets" integer DEFAULT 0,
    "max_reps_by_weight" "jsonb" DEFAULT '{}'::"jsonb",
    "last_performed" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_statistics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "order_in_workout" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "definition_id" "uuid" NOT NULL
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planned_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planned_workout_id" "uuid" NOT NULL,
    "definition_id" "uuid" NOT NULL,
    "order_index" integer DEFAULT 0,
    "sets_count" integer,
    "reps_range" "text",
    "rpe_target" "text",
    "rest_seconds" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."planned_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planned_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "day_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."planned_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "cpf" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    "username" "text",
    "subscription_plan" "text" DEFAULT 'free'::"text",
    "avatar_url" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_template" boolean DEFAULT false,
    "price" numeric(10,2) DEFAULT 0.00,
    "cover_image" "text",
    "origin_template_id" "uuid"
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "weight" numeric(6,2),
    "reps" integer NOT NULL,
    "rpe" numeric(3,1),
    "observations" "text",
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "side" "text",
    "technique" "text" DEFAULT 'normal'::"text",
    "distance" numeric(10,3),
    "duration_seconds" integer,
    "set_type" "public"."set_type_enum" DEFAULT 'normal'::"public"."set_type_enum",
    "parent_set_id" "uuid",
    "super_set_id" "uuid",
    CONSTRAINT "sets_data_check" CHECK (((("weight" IS NOT NULL) AND ("reps" IS NOT NULL)) OR (("distance" IS NOT NULL) OR ("duration_seconds" IS NOT NULL)))),
    CONSTRAINT "sets_side_check" CHECK (("side" = ANY (ARRAY['E'::"text", 'D'::"text"]))),
    CONSTRAINT "sets_technique_check" CHECK (("technique" = ANY (ARRAY['normal'::"text", 'warmup'::"text", 'dropset'::"text", 'rest_pause'::"text", 'failure'::"text"])))
);


ALTER TABLE "public"."sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "workout_data" "jsonb" NOT NULL
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workout_date" "date" DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "planned_workout_id" "uuid",
    "ended_at" timestamp with time zone
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."coaching_messages"
    ADD CONSTRAINT "coaching_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_coach_id_student_id_key" UNIQUE ("coach_id", "student_id");



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_definitions"
    ADD CONSTRAINT "exercise_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_statistics"
    ADD CONSTRAINT "exercise_statistics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_statistics"
    ADD CONSTRAINT "exercise_statistics_user_id_definition_id_key" UNIQUE ("user_id", "definition_id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planned_exercises"
    ADD CONSTRAINT "planned_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planned_workouts"
    ADD CONSTRAINT "planned_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cpf_key" UNIQUE ("cpf");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cpf_unique" UNIQUE ("cpf");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sets"
    ADD CONSTRAINT "sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_coaching_coach" ON "public"."coaching_relationships" USING "btree" ("coach_id");



CREATE INDEX "idx_coaching_student" ON "public"."coaching_relationships" USING "btree" ("student_id");



CREATE UNIQUE INDEX "idx_daily_checkin_user_date" ON "public"."daily_checkins" USING "btree" ("user_id", "date");



CREATE INDEX "idx_exercise_tags" ON "public"."exercise_definitions" USING "gin" ("tags");



CREATE INDEX "idx_exercises_definition_id" ON "public"."exercises" USING "btree" ("definition_id");



CREATE INDEX "idx_exercises_workout_id" ON "public"."exercises" USING "btree" ("workout_id");



CREATE INDEX "idx_messages_created_at" ON "public"."coaching_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_relationship" ON "public"."coaching_messages" USING "btree" ("relationship_id");



CREATE INDEX "idx_profiles_cpf" ON "public"."profiles" USING "btree" ("cpf");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_programs_student" ON "public"."programs" USING "btree" ("student_id");



CREATE INDEX "idx_sets_exercise_id" ON "public"."sets" USING "btree" ("exercise_id");



CREATE INDEX "idx_sets_parent" ON "public"."sets" USING "btree" ("parent_set_id");



CREATE INDEX "idx_sets_superset" ON "public"."sets" USING "btree" ("super_set_id");



CREATE UNIQUE INDEX "idx_unique_system_exercise" ON "public"."exercise_definitions" USING "btree" ("name_lowercase") WHERE (("user_id" IS NULL) AND ("is_system" = true));



CREATE UNIQUE INDEX "idx_unique_user_exercise" ON "public"."exercise_definitions" USING "btree" ("user_id", "name_lowercase") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_workouts_date_only" ON "public"."workouts" USING "btree" ("workout_date");



CREATE INDEX "idx_workouts_user_date" ON "public"."workouts" USING "btree" ("user_id", "workout_date" DESC);



CREATE UNIQUE INDEX "unique_active_program_per_student" ON "public"."programs" USING "btree" ("student_id") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "username_unique_idx" ON "public"."profiles" USING "btree" ("username");



CREATE OR REPLACE TRIGGER "trg_profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_recalc_stats" AFTER INSERT OR DELETE OR UPDATE ON "public"."sets" FOR EACH ROW EXECUTE FUNCTION "public"."recalc_exercise_stats"();



ALTER TABLE ONLY "public"."coaching_messages"
    ADD CONSTRAINT "coaching_messages_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "public"."coaching_relationships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_messages"
    ADD CONSTRAINT "coaching_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exercise_definitions"
    ADD CONSTRAINT "exercise_definitions_origin_system_id_fkey" FOREIGN KEY ("origin_system_id") REFERENCES "public"."exercise_definitions"("id");



ALTER TABLE ONLY "public"."exercise_definitions"
    ADD CONSTRAINT "exercise_definitions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_statistics"
    ADD CONSTRAINT "exercise_statistics_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."exercise_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_statistics"
    ADD CONSTRAINT "exercise_statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "fk_exercise_definition" FOREIGN KEY ("definition_id") REFERENCES "public"."exercise_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planned_exercises"
    ADD CONSTRAINT "planned_exercises_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."exercise_definitions"("id");



ALTER TABLE ONLY "public"."planned_exercises"
    ADD CONSTRAINT "planned_exercises_planned_workout_id_fkey" FOREIGN KEY ("planned_workout_id") REFERENCES "public"."planned_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planned_workouts"
    ADD CONSTRAINT "planned_workouts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_coach_id_profiles_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_origin_template_id_fkey" FOREIGN KEY ("origin_template_id") REFERENCES "public"."programs"("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sets"
    ADD CONSTRAINT "sets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sets"
    ADD CONSTRAINT "sets_parent_set_id_fkey" FOREIGN KEY ("parent_set_id") REFERENCES "public"."sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_planned_workout_id_fkey" FOREIGN KEY ("planned_workout_id") REFERENCES "public"."planned_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Acesso básico autenticado exercises" ON "public"."planned_exercises" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Acesso básico autenticado workouts" ON "public"."planned_workouts" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Acesso restrito a donos do programa" ON "public"."planned_workouts" USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "planned_workouts"."program_id") AND (("p"."coach_id" = "auth"."uid"()) OR ("p"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Acesso restrito a donos do programa (nivel exercicio)" ON "public"."planned_exercises" USING ((EXISTS ( SELECT 1
   FROM ("public"."planned_workouts" "pw"
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "planned_exercises"."planned_workout_id") AND (("p"."coach_id" = "auth"."uid"()) OR ("p"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Allow authenticated users to create exercises" ON "public"."exercises" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = ( SELECT "workouts"."user_id"
   FROM "public"."workouts"
  WHERE ("workouts"."id" = "exercises"."workout_id"))));



CREATE POLICY "Allow authenticated users to create sets" ON "public"."sets" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = ( SELECT "w"."user_id"
   FROM ("public"."exercises" "e"
     JOIN "public"."workouts" "w" ON (("e"."workout_id" = "w"."id")))
  WHERE ("e"."id" = "sets"."exercise_id"))));



CREATE POLICY "Allow authenticated users to create workouts" ON "public"."workouts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to update their exercises" ON "public"."exercises" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = ( SELECT "workouts"."user_id"
   FROM "public"."workouts"
  WHERE ("workouts"."id" = "exercises"."workout_id")))) WITH CHECK (("auth"."uid"() = ( SELECT "workouts"."user_id"
   FROM "public"."workouts"
  WHERE ("workouts"."id" = "exercises"."workout_id"))));



CREATE POLICY "Allow authenticated users to update their sets" ON "public"."sets" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = ( SELECT "w"."user_id"
   FROM ("public"."exercises" "e"
     JOIN "public"."workouts" "w" ON (("e"."workout_id" = "w"."id")))
  WHERE ("e"."id" = "sets"."exercise_id")))) WITH CHECK (("auth"."uid"() = ( SELECT "w"."user_id"
   FROM ("public"."exercises" "e"
     JOIN "public"."workouts" "w" ON (("e"."workout_id" = "w"."id")))
  WHERE ("e"."id" = "sets"."exercise_id"))));



CREATE POLICY "Allow authenticated users to update their workouts" ON "public"."workouts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to view their exercises" ON "public"."exercises" FOR SELECT TO "authenticated" USING (("auth"."uid"() = ( SELECT "workouts"."user_id"
   FROM "public"."workouts"
  WHERE ("workouts"."id" = "exercises"."workout_id"))));



CREATE POLICY "Allow authenticated users to view their sets" ON "public"."sets" FOR SELECT TO "authenticated" USING (("auth"."uid"() = ( SELECT "w"."user_id"
   FROM ("public"."exercises" "e"
     JOIN "public"."workouts" "w" ON (("e"."workout_id" = "w"."id")))
  WHERE ("e"."id" = "sets"."exercise_id"))));



CREATE POLICY "Allow authenticated users to view their workouts" ON "public"."workouts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Aluno pode ver seus coaches" ON "public"."coaching_relationships" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Aluno vê seus programas" ON "public"."programs" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Coach cria programas para alunos" ON "public"."programs" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "coach_id") AND (EXISTS ( SELECT 1
   FROM "public"."coaching_relationships"
  WHERE (("coaching_relationships"."coach_id" = "auth"."uid"()) AND ("coaching_relationships"."student_id" = "programs"."student_id") AND ("coaching_relationships"."status" = 'active'::"text"))))));



CREATE POLICY "Coach pode ver seus alunos" ON "public"."coaching_relationships" FOR SELECT USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coach vê exercicios dos seus alunos" ON "public"."exercises" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."workouts" "w"
     JOIN "public"."coaching_relationships" "cr" ON (("cr"."student_id" = "w"."user_id")))
  WHERE (("w"."id" = "exercises"."workout_id") AND ("cr"."coach_id" = "auth"."uid"()) AND ("cr"."status" = 'active'::"text")))));



CREATE POLICY "Coach vê series dos seus alunos" ON "public"."sets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."exercises" "e"
     JOIN "public"."workouts" "w" ON (("w"."id" = "e"."workout_id")))
     JOIN "public"."coaching_relationships" "cr" ON (("cr"."student_id" = "w"."user_id")))
  WHERE (("e"."id" = "sets"."exercise_id") AND ("cr"."coach_id" = "auth"."uid"()) AND ("cr"."status" = 'active'::"text")))));



CREATE POLICY "Coach vê treinos dos seus alunos" ON "public"."workouts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_relationships" "cr"
  WHERE (("cr"."student_id" = "workouts"."user_id") AND ("cr"."coach_id" = "auth"."uid"()) AND ("cr"."status" = 'active'::"text")))));



CREATE POLICY "Dono ou Coach deleta exercicios" ON "public"."exercises" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workouts" "w"
  WHERE (("w"."id" = "exercises"."workout_id") AND (("w"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."coaching_relationships" "cr"
          WHERE (("cr"."coach_id" = "auth"."uid"()) AND ("cr"."student_id" = "w"."user_id") AND ("cr"."status" = 'active'::"text")))))))));



CREATE POLICY "Dono ou Coach deleta sets" ON "public"."sets" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."exercises" "e"
     JOIN "public"."workouts" "w" ON (("w"."id" = "e"."workout_id")))
  WHERE (("e"."id" = "sets"."exercise_id") AND (("w"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."coaching_relationships" "cr"
          WHERE (("cr"."coach_id" = "auth"."uid"()) AND ("cr"."student_id" = "w"."user_id") AND ("cr"."status" = 'active'::"text")))))))));



CREATE POLICY "Dono ou Coach deleta treino" ON "public"."workouts" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."coaching_relationships" "cr"
  WHERE (("cr"."coach_id" = "auth"."uid"()) AND ("cr"."student_id" = "workouts"."user_id") AND ("cr"."status" = 'active'::"text"))))));



CREATE POLICY "Enviar mensagem na relação" ON "public"."coaching_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."coaching_relationships" "cr"
  WHERE (("cr"."id" = "coaching_messages"."relationship_id") AND (("cr"."coach_id" = "auth"."uid"()) OR ("cr"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Gerenciamento de programas" ON "public"."programs" USING ((("auth"."uid"() = "coach_id") OR ("auth"."uid"() = "student_id"))) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Leitura Unificada (Proprio + Sistema)" ON "public"."exercise_definitions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_system" = true)));



CREATE POLICY "Ler mensagens da relação" ON "public"."coaching_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_relationships" "cr"
  WHERE (("cr"."id" = "coaching_messages"."relationship_id") AND (("cr"."coach_id" = "auth"."uid"()) OR ("cr"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Permitir INSERT para o próprio usuário" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Permitir SELECT para o próprio usuário" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Permitir UPDATE para o próprio usuário" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Qualquer user autenticado cria relacionamento" ON "public"."coaching_relationships" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "System maintains stats" ON "public"."exercise_statistics" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Todos podem ver templates" ON "public"."programs" FOR SELECT USING (("is_template" = true));



CREATE POLICY "Users can view their own stats" ON "public"."exercise_statistics" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuario cria 1 programa para si" ON "public"."programs" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "coach_id") AND ("auth"."uid"() = "student_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."programs" "programs_1"
  WHERE (("programs_1"."coach_id" = "auth"."uid"()) AND ("programs_1"."student_id" = "auth"."uid"())))))));



CREATE POLICY "Usuarios veem apenas seu proprio perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuário cria seus checkins" ON "public"."daily_checkins" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuário pode gerenciar instâncias de seus exercícios" ON "public"."exercises" USING ("public"."is_user_bridge_owner"("workout_id", "definition_id")) WITH CHECK ("public"."is_user_bridge_owner"("workout_id", "definition_id"));



CREATE POLICY "Usuário pode gerenciar seus próprios treinos" ON "public"."workouts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuário pode gerenciar suas próprias definições" ON "public"."exercise_definitions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuário vê seus checkins" ON "public"."daily_checkins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem ATUALIZAR seus próprios templates" ON "public"."templates" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem DELETAR seus próprios templates" ON "public"."templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem INSERIR seus próprios templates" ON "public"."templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuários podem ler todos os templates" ON "public"."templates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Ver definicoes restritas (Dono ou Prescrito)" ON "public"."exercise_definitions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM (("public"."planned_exercises" "pe"
     JOIN "public"."planned_workouts" "pw" ON (("pw"."id" = "pe"."planned_workout_id")))
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE (("pe"."definition_id" = "exercise_definitions"."id") AND ("p"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Ver perfil de usuarios vinculados" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coaching_relationships" "cr"
  WHERE ((("cr"."coach_id" = "auth"."uid"()) AND ("cr"."student_id" = "profiles"."id")) OR (("cr"."student_id" = "auth"."uid"()) AND ("cr"."coach_id" = "profiles"."id"))))));



ALTER TABLE "public"."coaching_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_statistics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_own_profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."planned_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planned_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_own_profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."sets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_own_profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."activate_program"("p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_program"("p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_program"("p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_workout_density"("p_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_workout_density"("p_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_workout_density"("p_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."buy_exercise_pack"("p_pack_template_id" "uuid", "p_pack_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buy_exercise_pack"("p_pack_template_id" "uuid", "p_pack_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buy_exercise_pack"("p_pack_template_id" "uuid", "p_pack_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_system_exercises_to_user"("p_target_user_id" "uuid", "p_tag_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_system_exercises_to_user"("p_target_user_id" "uuid", "p_tag_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_system_exercises_to_user"("p_target_user_id" "uuid", "p_tag_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_autoral_program"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_autoral_program"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_autoral_program"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_global_tags_for_name"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_global_tags_for_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_global_tags_for_name"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_set_types" "text"[], "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_set_types" "text"[], "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("p_set_types" "text"[], "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_email_by_cpf"("p_cpf" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_email_by_cpf"("p_cpf" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_email_by_cpf"("p_cpf" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_exercise_analytics"("p_definition_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_exercise_analytics"("p_definition_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exercise_analytics"("p_definition_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_exercise_set_history"("p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_exercise_set_history"("p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exercise_set_history"("p_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_historical_rep_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_historical_rep_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_historical_rep_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_historical_weight_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_historical_weight_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_historical_weight_prs"("p_definition_ids" "uuid"[], "p_exclude_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_recent_workout"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_recent_workout"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_recent_workout"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_exercise_in_workout"("p_workout_id" "uuid", "p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_exercise_in_workout"("p_workout_id" "uuid", "p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_exercise_in_workout"("p_workout_id" "uuid", "p_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profile_summary_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_profile_summary_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profile_summary_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_unique_exercises"("p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_unique_exercises"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_unique_exercises"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unique_exercise_catalog"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_unique_exercise_catalog"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unique_exercise_catalog"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workout_data_grouped"("p_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workout_data_grouped"("p_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workout_data_grouped"("p_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workout_date_by_id"("p_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workout_date_by_id"("p_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workout_date_by_id"("p_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_with_cpf"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_with_cpf"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_with_cpf"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_bridge_owner"("p_workout_id" "uuid", "p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_bridge_owner"("p_workout_id" "uuid", "p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_bridge_owner"("p_workout_id" "uuid", "p_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_exercise_definitions"("p_old_definition_id" "uuid", "p_target_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_exercise_definitions"("p_old_definition_id" "uuid", "p_target_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_exercise_definitions"("p_old_definition_id" "uuid", "p_target_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_exercise_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_exercise_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_exercise_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_exercises"("p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_exercises"("p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_exercises"("p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_planned_exercises"("p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_planned_exercises"("p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_planned_exercises"("p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."coaching_messages" TO "anon";
GRANT ALL ON TABLE "public"."coaching_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_messages" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_relationships" TO "anon";
GRANT ALL ON TABLE "public"."coaching_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checkins" TO "anon";
GRANT ALL ON TABLE "public"."daily_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_definitions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_statistics" TO "anon";
GRANT ALL ON TABLE "public"."exercise_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."planned_exercises" TO "anon";
GRANT ALL ON TABLE "public"."planned_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."planned_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."planned_workouts" TO "anon";
GRANT ALL ON TABLE "public"."planned_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."planned_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."sets" TO "anon";
GRANT ALL ON TABLE "public"."sets" TO "authenticated";
GRANT ALL ON TABLE "public"."sets" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































