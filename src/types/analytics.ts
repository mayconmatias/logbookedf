export interface ExerciseAnalyticsDataV2 {
  last_progression: {
    date: string | null;
    days_ago: number | null;
  };
  current_status: 'progressing' | 'stagnated' | 'regressing' | 'insufficient_data';
  avg_duration_min: number;
  avg_rest_sec: number;
  favorite_set_type: string | null;
  
  chart_e1rm: {
    date: string;
    max: number;
    avg: number;
    min: number;
  }[];

  chart_volume: {
    date: string;
    vol_load: number;
    total_reps: number;
    sets_count: number;
  }[];

  // [NOVO]
  last_session_sets: {
    set_number: number;
    weight: number;
    reps: number;
    rpe: number | null;
    type: string;
  }[] | null;
}