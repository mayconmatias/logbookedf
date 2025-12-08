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
  side?: 'E' | 'D';
  
  // Novos campos
  set_type: SetType;
  parent_set_id?: string | null; // Se for filho de um Drop/Cluster
  
  // Front-end only (para renderização aninhada)
  subSets?: WorkoutSet[]; 
  
  sessionWorkoutId?: string; // Mantido do seu código anterior
}

export interface WorkoutExercise {
  id: string;
  definition_id: string;
  name: string;
  sets: WorkoutSet[];
}

// ... restante dos tipos (WorkoutHistoryItem, etc) mantidos
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