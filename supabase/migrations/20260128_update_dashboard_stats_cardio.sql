-- Atualização da função get_dashboard_stats para incluir métricas de cardio (Strava)

CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"("p_set_types" "text"[] DEFAULT ARRAY['normal'::"text", 'drop'::"text", 'rest_pause'::"text", 'cluster'::"text", 'biset'::"text", 'triset'::"text"], "p_program_id" "uuid" DEFAULT NULL::"uuid") 
RETURNS json
LANGUAGE "plpgsql" 
STABLE
SET "search_path" TO 'public'
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
  v_cardio_summary json; -- NOVA VARIÁVEL
  
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

  -- 1. ESTATÍSTICAS POR TAG (Mantido)
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

  -- 2. ESTATÍSTICAS POR EXERCÍCIO (Mantido)
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

  -- 3. EVOLUÇÃO SEMANAL (Mantido)
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

  -- 4. EVOLUÇÃO DIÁRIA (Mantido)
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

  -- 5. HIGHLIGHTS (Mantido)
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

  WITH set_intervals AS (
    SELECT 
      e.workout_id,
      s.performed_at,
      LAG(s.performed_at) OVER (PARTITION BY e.workout_id ORDER BY s.performed_at) as prev_time
    FROM sets s
    JOIN exercises e ON s.exercise_id = e.id
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

  -- 6. CARDIO SUMMARY (NOVO)
  WITH cardio_stats AS (
    SELECT 
      COUNT(*) as total_count,
      SUM(distance_meters) / 1000 as total_km,
      SUM(calories) as total_kcal,
      SUM(duration_seconds) / 60 as total_minutes,
      COUNT(DISTINCT date_trunc('week', start_date)) as active_weeks
    FROM external_activities
    WHERE user_id = v_user_id
      AND start_date >= (CURRENT_DATE - INTERVAL '30 days')
  )
  SELECT json_build_object(
    'monthly_count', COALESCE(total_count, 0),
    'weekly_avg', ROUND(COALESCE(total_count::numeric / NULLIF(active_weeks, 0), 0), 1),
    'total_km', ROUND(COALESCE(total_km::numeric, 0), 1),
    'total_kcal', ROUND(COALESCE(total_kcal::numeric, 0), 0),
    'total_minutes', ROUND(COALESCE(total_minutes::numeric, 0), 0)
  ) INTO v_cardio_summary FROM cardio_stats;

  -- RETORNO FINAL
  RETURN json_build_object(
    'tag_stats', COALESCE(v_tag_stats, '[]'::json),
    'exercise_stats', COALESCE(v_exercise_stats, '[]'::json),
    'evolution_trend', COALESCE(v_evolution_trend, '[]'::json),
    'evolution_daily', COALESCE(v_evolution_daily, '[]'::json),
    'time_stats', v_time_stats,
    'last_checkin', v_last_checkin,
    'current_streak', COALESCE(v_current_streak, 0),
    'consistency_matrix', (SELECT json_agg(workout_date) FROM workouts WHERE user_id = v_user_id AND workout_date >= (CURRENT_DATE - INTERVAL '90 days')),
    'cardio_summary', v_cardio_summary -- NOVO CAMPO
  );
END;
$$;
