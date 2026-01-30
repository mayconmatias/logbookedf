export interface ChartDataPoint {
  date: string | number;
  value: number;
  label?: string;
  vol_load?: number; // Added for V2 support
  avg?: number;      // Added for V2 support
}

export interface HistoricalSet {
  date: string | null;
  workout_date?: string; // Support for alternate field name
  weight: number;
  reps: number;
  e1rm: number;
  set_number?: number; // Added
  rpe?: number; // Added
  is_pr?: boolean;
  days_ago?: number;
}

export interface ExerciseStats {
  total_sets: number;
  total_volume: number;
  max_weight: number;
  max_e1rm: number;
  max_reps_by_weight?: Record<string, number>;
}

export interface ExerciseAnalyticsData {
  prStreakCount: number;
  daysSinceLastPR: number;
  bestSetAllTime: HistoricalSet | null;
  bestSetPreviousSession: HistoricalSet | null;
  historicalPRsList: HistoricalSet[];
  chartDataE1RM: ChartDataPoint[];
  chartDataAccumulatedVolume: ChartDataPoint[];
  calendarData: string[];
}

export interface ExerciseAnalyticsDataV2 {
  current_status: 'progressing' | 'stagnated' | 'regressing' | 'analyzing';
  last_progression: {
    days_ago: number;
    date: string;
  } | null;
  last_session_sets: HistoricalSet[];
  avg_duration_min: number;
  avg_rest_sec: number;
  favorite_set_type: string;
  chart_e1rm: ChartDataPoint[];
  chart_volume: ChartDataPoint[];
}