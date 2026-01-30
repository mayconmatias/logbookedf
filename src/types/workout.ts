import { MusicTrackInfo } from './music';

export type SetType = 'normal' | 'warmup' | 'drop' | 'rest_pause' | 'cluster' | 'biset' | 'triset';

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  rpe?: number;
  observations?: string;
  performed_at?: string;
  side?: 'E' | 'D' | null;
  music_data?: MusicTrackInfo;

  set_type: SetType;
  parent_set_id?: string | null;

  subSets?: WorkoutSet[];
  sessionWorkoutId?: string;
}

export interface WorkoutExercise {
  id: string;
  definition_id: string;
  name: string;
  sets: WorkoutSet[];
  order_in_workout: number;
  is_unilateral: boolean;

  // [NOVO] Campos específicos da sessão (vindos do programa)
  notes?: string;
  video_url?: string;

  substituted_by_id?: string | null;
  is_substitution?: boolean;
  original_exercise_id?: string | null;
}

export interface WorkoutHistoryItem {
  id: string;
  workout_date: string;
  user_id: string;
  template_name?: string;
  performed_data: WorkoutExercise[];
}

export type PerformanceSet = {
  id: string;
  set_number?: number;
  weight: number;
  reps: number;
  rpe?: number;
  observations?: string;
  workout_date: string;
  e1rm?: number;
};

export type HistoricalWeightPR = {
  definition_id: string;
  max_weight: number;
};

export type HistoricalRepPR = {
  definition_id: string;
  weight: number;
  max_reps: number;
};

export interface PerformancePeekData {
  lastPerformance: PerformanceSet[];
  bestPerformance: PerformanceSet | null;
  historicalPRs: {
    repPRs: HistoricalRepPR[];
    weightPRs: HistoricalWeightPR[];
  };
}

export interface HistoricalSet {
  date: string;
  weight: number;
  reps: number;
  e1rm: number;
}