// src/types/workout.ts

/**
 * Define a estrutura de uma única série (set) salva no banco.
 * (Corresponde à tabela 'sets' do Supabase)
 */
export interface WorkoutSet {
  id: string;
  exercise_id: string; // <-- ID da "Instância" (tabela 'exercises')
  set_number: number;
  weight: number;
  reps: number;
  rpe?: number;
  observations?: string;
  performed_at?: string;
  side?: 'E' | 'D';
  
  // [NOVO] Campo opcional para passar o ID da sessão atual para o modal de share
  sessionWorkoutId?: string; 
}

/**
 * Define um exercício dentro de um treino salvo.
 * (Corresponde à nova RPC 'get_workout_data_grouped')
 */
export interface WorkoutExercise {
  id: string; // ID da "Instância" (da tabela 'exercises')
  definition_id: string; // ID da "Definição"
  name: string; // O nome (vem do JOIN com 'exercise_definitions')
  sets: WorkoutSet[];
}

/**
 * Define o item de histórico de treino (para WorkoutHistory.tsx).
 */
export interface WorkoutHistoryItem {
  id: string;
  workout_date: string;
  user_id: string;
  template_name?: string; // (Vindo do 'workouts.template_id' se existir)
  performed_data: WorkoutExercise[];
}

/**
 * Define o formato de uma série para o "quick history" (usado no WorkoutForm).
 */
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

/**
 * Os PRs agora são rastreados por 'definition_id'
 */
export type HistoricalWeightPR = {
  definition_id: string;
  max_weight: number;
};

/**
 * Os PRs agora são rastreados por 'definition_id'
 */
export type HistoricalRepPR = {
  definition_id: string;
  weight: number;
  max_reps: number;
};

/**
 * Agrupa todos os dados de "peek" de performance.
 */
export interface PerformancePeekData {
  lastPerformance: PerformanceSet[];
  bestPerformance: PerformanceSet | null;
  historicalPRs: {
    repPRs: HistoricalRepPR[];
    weightPRs: HistoricalWeightPR[];
  };
}

/**
 * Define o formato que o SetShareCard espera.
 */
export interface HistoricalSet {
  date: string;
  weight: number;
  reps: number;
  e1rm: number;
}