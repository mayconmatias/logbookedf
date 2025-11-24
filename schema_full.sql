


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."activate_program"("p_program_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Descobre quem é o dono do programa
  SELECT student_id INTO v_owner_id FROM public.programs WHERE id = p_program_id;

  -- Verifica segurança (usuário logado deve ser o dono ou coach)
  IF v_owner_id != auth.uid() AND NOT EXISTS (
     SELECT 1 FROM coaching_relationships WHERE coach_id = auth.uid() AND student_id = v_owner_id
  ) THEN
     RAISE EXCEPTION 'Permissão negada.';
  END IF;

  -- 1. Desativa todos os programas desse usuário
  UPDATE public.programs
  SET is_active = false
  WHERE student_id = v_owner_id;

  -- 2. Ativa apenas o escolhido
  UPDATE public.programs
  SET is_active = true
  WHERE id = p_program_id;
END;
$$;


ALTER FUNCTION "public"."activate_program"("p_program_id" "uuid") OWNER TO "postgres";


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

  -- 1. Encontra a data do último treino (excluindo o atual)
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
      -- 'lastPerformance': Todas as séries do último dia
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
      
      -- 'bestPerformance': A melhor série de e1RM de todos os tempos (excluindo o atual)
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
            AND s.reps > 0 AND s.weight > 0
            AND (p_exclude_workout_id IS NULL OR w.id != p_exclude_workout_id)
          ORDER BY
            e1rm DESC, s.weight DESC
          LIMIT 1
        ) bp
      ),
      
      -- 'historicalPRs': Os PRs de peso e repetição
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
declare
  v_user_id uuid;
  result_json jsonb;
begin
  -- ============================================================
  -- 1. SEGURANÇA E DEFINIÇÃO DO ALVO
  -- ============================================================
  if p_target_user_id is null then
    v_user_id := auth.uid(); -- Se não passou ID, sou eu mesmo
  else
    -- Se passou ID, verifica: Sou coach dele e o contrato está ativo?
    if not exists (
      select 1 from coaching_relationships 
      where coach_id = auth.uid() 
      and student_id = p_target_user_id
      and status = 'active'
    ) then
      raise exception 'Permissão negada: Você não é coach deste aluno.';
    end if;
    v_user_id := p_target_user_id;
  end if;

  -- ============================================================
  -- 2. CÁLCULOS COMPLEXOS
  -- ============================================================
  WITH all_sets AS (
    SELECT
      s.id,
      s.performed_at,
      w.workout_date,
      s.weight,
      s.reps,
      -- Sua fórmula personalizada de e1RM
      (s.weight * power(1 + (0.032 * s.reps), 0.90))::numeric(10, 2) AS e1rm,
      (s.weight * s.reps) AS set_volume
    FROM
      sets s
      JOIN exercises e ON s.exercise_id = e.id
      JOIN workouts w ON e.workout_id = w.id
    WHERE
      w.user_id = v_user_id -- <--- ID DINÂMICO
      AND e.definition_id = p_definition_id
      AND s.weight > 0
      AND s.reps > 0
  ),
  session_bests AS (
    SELECT
      workout_date,
      MAX(e1rm) AS best_e1rm,
      SUM(set_volume) AS session_volume
    FROM all_sets
    GROUP BY workout_date
  ),
  ranked_sessions AS (
    SELECT
      workout_date,
      best_e1rm,
      session_volume,
      COALESCE(MAX(best_e1rm) OVER (ORDER BY workout_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS all_time_best_before,
      LAG(best_e1rm) OVER (ORDER BY workout_date) AS previous_session_best_e1rm
    FROM session_bests
  ),
  pr_sessions AS (
    SELECT *, (best_e1rm > all_time_best_before) AS is_pr
    FROM ranked_sessions
  ),
  streak_calc AS (
    SELECT *,
      ROW_NUMBER() OVER (ORDER BY workout_date) -
      ROW_NUMBER() OVER (PARTITION BY is_pr ORDER BY workout_date) AS pr_group
    FROM pr_sessions
    ORDER BY workout_date DESC
  ),
  current_streak AS (
    SELECT COUNT(*) AS streak_count
    FROM streak_calc
    WHERE is_pr = TRUE
      AND pr_group = (SELECT pr_group FROM streak_calc WHERE is_pr = TRUE ORDER BY workout_date DESC LIMIT 1)
  ),
  latest_session AS (
    SELECT * FROM pr_sessions ORDER BY workout_date DESC LIMIT 1
  ),
  latest_pr_date AS (
    SELECT MAX(workout_date) AS date FROM pr_sessions WHERE is_pr = TRUE
  )
  -- Constrói o JSON final
  SELECT
    jsonb_build_object(
      'prStreakCount', (
        SELECT CASE
          WHEN (SELECT is_pr FROM latest_session) = TRUE THEN (SELECT streak_count FROM current_streak)
          ELSE 0
        END
      ),
      'daysSinceLastPR', (
        SELECT CASE
          WHEN (SELECT date FROM latest_pr_date) IS NOT NULL
          THEN (CURRENT_DATE - (SELECT date FROM latest_pr_date))
          ELSE NULL
        END
      ),
      'bestSetAllTime', (
        SELECT row_to_json(s)
        FROM (
          SELECT workout_date AS date, weight, reps, e1rm
          FROM all_sets
          ORDER BY e1rm DESC, workout_date DESC
          LIMIT 1
        ) s
      ),
      'bestSetPreviousSession', (
        SELECT row_to_json(s)
        FROM (
          SELECT workout_date AS date, weight, reps, e1rm
          FROM all_sets
          WHERE workout_date = (
             SELECT workout_date FROM session_bests ORDER BY workout_date DESC LIMIT 1 OFFSET 1
          )
          ORDER BY e1rm DESC
          LIMIT 1
        ) s
      ),
      'historicalPRsList', (
        SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.e1rm DESC), '[]'::jsonb)
        FROM (
          SELECT DISTINCT ON (s.e1rm) s.workout_date AS date, s.weight, s.reps, s.e1rm
          FROM all_sets s
          JOIN pr_sessions p ON s.workout_date = p.workout_date AND s.e1rm = p.best_e1rm
          WHERE p.is_pr = TRUE
          ORDER BY s.e1rm DESC, s.weight DESC
          LIMIT 50
        ) s
      ),
      'chartDataE1RM', (
        SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.date), '[]'::jsonb)
        FROM (
          SELECT workout_date AS date, best_e1rm AS value
          FROM session_bests
        ) c
      ),
      'chartDataAccumulatedVolume', (
        SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.date), '[]'::jsonb)
        FROM (
          SELECT
            workout_date AS date,
            SUM(session_volume) OVER (ORDER BY workout_date)::numeric(10, 2) AS value
          FROM session_bests
        ) c
      ),
      'calendarData', (
        SELECT COALESCE(jsonb_agg(row_to_json(cal) ORDER BY cal.date), '[]'::jsonb)
        FROM (
          SELECT workout_date AS date, is_pr
          FROM pr_sessions
        ) cal
      )
    )
  INTO
    result_json;

  RETURN result_json;
end;
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
      -- Fórmula de e1RM personalizada
      (s.weight * power(1 + (0.032 * s.reps), 0.90)) AS e1rm
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
    JOIN workouts w ON e.workout_id = w.id
    WHERE
      w.user_id = auth.uid()
      AND e.definition_id = p_definition_id -- <-- Filtro pela Definição
      AND s.weight > 0 
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
    -- Um PR é simplesmente um e1RM maior que o recorde anterior
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

  -- 3. Se não encontrou, cria a nova instância
  INSERT INTO public.exercises (workout_id, definition_id)
  VALUES (p_workout_id, p_definition_id)
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


CREATE OR REPLACE FUNCTION "public"."get_unique_exercise_catalog"() RETURNS TABLE("exercise_id" "uuid", "exercise_name_capitalized" "text", "exercise_name_lowercase" "text", "last_performed" "date", "total_sets" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  WITH set_data AS (
    SELECT
      e.definition_id,
      COUNT(s.id) as total_sets,
      MAX(w.workout_date) as last_performed
    FROM
      public.sets s
    JOIN
      public.exercises e ON s.exercise_id = e.id
    JOIN
      public.workouts w ON e.workout_id = w.id
    WHERE
      w.user_id = auth.uid()
    GROUP BY
      e.definition_id
  )
  SELECT
    ed.id as exercise_id,
    ed.name as exercise_name_capitalized,
    ed.name_lowercase as exercise_name_lowercase,
    sd.last_performed,
    COALESCE(sd.total_sets, 0) as total_sets
  FROM
    public.exercise_definitions ed
  LEFT JOIN
    set_data sd ON ed.id = sd.definition_id
  WHERE
    ed.user_id = auth.uid()
  ORDER BY
    ed.name ASC;
$$;


ALTER FUNCTION "public"."get_unique_exercise_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workout_data_grouped"("p_workout_id" "uuid") RETURNS TABLE("id" "uuid", "definition_id" "uuid", "name" "text", "sets" json)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- CORREÇÃO AQUI: Usamos o alias 'w' para garantir que não haja dúvida
  SELECT w.user_id INTO v_owner_id 
  FROM workouts w 
  WHERE w.id = p_workout_id;

  -- Se o treino não existe, retorna vazio
  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  -- SEGURANÇA: Verifica se quem chama é o dono OU o coach ativo
  IF v_owner_id != auth.uid() THEN
     IF NOT EXISTS (
        SELECT 1 FROM coaching_relationships cr
        WHERE cr.coach_id = auth.uid() 
          AND cr.student_id = v_owner_id 
          AND cr.status = 'active'
     ) THEN
        RAISE EXCEPTION 'Acesso negado: Você não tem permissão para ver este treino.';
     END IF;
  END IF;

  -- QUERY PRINCIPAL (Com aliases reforçados)
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
          'performed_at', s.performed_at
        ) ORDER BY s.set_number
      ) FILTER (WHERE s.id IS NOT NULL),
      '[]'::json
    ) AS sets
  FROM exercises e
  JOIN exercise_definitions def ON e.definition_id = def.id
  LEFT JOIN sets s ON s.exercise_id = e.id
  WHERE e.workout_id = p_workout_id
  GROUP BY e.id, e.definition_id, def.name
  ORDER BY min(e.created_at);
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


CREATE TABLE IF NOT EXISTS "public"."coaching_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "coaching_relationships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."coaching_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_lowercase" "text" GENERATED ALWAYS AS ("lower"("name")) STORED,
    "default_notes" "text",
    "video_url" "text"
);


ALTER TABLE "public"."exercise_definitions" OWNER TO "postgres";


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
    "subscription_plan" "text" DEFAULT 'free'::"text"
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
    CONSTRAINT "sets_side_check" CHECK (("side" = ANY (ARRAY['E'::"text", 'D'::"text"])))
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
    "template_id" "uuid"
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_coach_id_student_id_key" UNIQUE ("coach_id", "student_id");



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_definitions"
    ADD CONSTRAINT "exercise_definitions_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."exercise_definitions"
    ADD CONSTRAINT "unique_user_exercise_name" UNIQUE ("user_id", "name_lowercase");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_coaching_coach" ON "public"."coaching_relationships" USING "btree" ("coach_id");



CREATE INDEX "idx_coaching_student" ON "public"."coaching_relationships" USING "btree" ("student_id");



CREATE INDEX "idx_exercises_definition_id" ON "public"."exercises" USING "btree" ("definition_id");



CREATE INDEX "idx_exercises_workout_id" ON "public"."exercises" USING "btree" ("workout_id");



CREATE INDEX "idx_profiles_cpf" ON "public"."profiles" USING "btree" ("cpf");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_programs_student" ON "public"."programs" USING "btree" ("student_id");



CREATE INDEX "idx_sets_exercise_id" ON "public"."sets" USING "btree" ("exercise_id");



CREATE INDEX "idx_workouts_date_only" ON "public"."workouts" USING "btree" ("workout_date");



CREATE INDEX "idx_workouts_user_date" ON "public"."workouts" USING "btree" ("user_id", "workout_date" DESC);



CREATE UNIQUE INDEX "username_unique_idx" ON "public"."profiles" USING "btree" ("username");



CREATE OR REPLACE TRIGGER "trg_profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_relationships"
    ADD CONSTRAINT "coaching_relationships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_definitions"
    ADD CONSTRAINT "exercise_definitions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



CREATE POLICY "Gerenciamento de programas" ON "public"."programs" USING ((("auth"."uid"() = "coach_id") OR ("auth"."uid"() = "student_id"))) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Permitir INSERT para o próprio usuário" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Permitir SELECT para o próprio usuário" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Permitir UPDATE para o próprio usuário" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Qualquer user autenticado cria relacionamento" ON "public"."coaching_relationships" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Todos podem ver templates" ON "public"."programs" FOR SELECT USING (("is_template" = true));



CREATE POLICY "Usuario cria 1 programa para si" ON "public"."programs" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "coach_id") AND ("auth"."uid"() = "student_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."programs" "programs_1"
  WHERE (("programs_1"."coach_id" = "auth"."uid"()) AND ("programs_1"."student_id" = "auth"."uid"())))))));



CREATE POLICY "Usuarios veem apenas seu proprio perfil" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuário pode gerenciar instâncias de seus exercícios" ON "public"."exercises" USING ("public"."is_user_bridge_owner"("workout_id", "definition_id")) WITH CHECK ("public"."is_user_bridge_owner"("workout_id", "definition_id"));



CREATE POLICY "Usuário pode gerenciar seus próprios treinos" ON "public"."workouts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuário pode gerenciar suas próprias definições" ON "public"."exercise_definitions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuário pode ler suas próprias definições" ON "public"."exercise_definitions" FOR SELECT USING (("auth"."uid"() = "user_id"));



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



ALTER TABLE "public"."coaching_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_definitions" ENABLE ROW LEVEL SECURITY;


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


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_program"("p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_program"("p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_program"("p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_program"("p_template_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_exercise_definition"("p_definition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fetch_performance_peek_by_def_id"("p_definition_id" "uuid", "p_exclude_workout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_accumulated_volume"("p_definition_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_exercise_definition"("p_definition_id" "uuid", "p_new_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."coaching_relationships" TO "anon";
GRANT ALL ON TABLE "public"."coaching_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_definitions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_definitions" TO "service_role";



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







