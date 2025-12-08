// src/types/analytics.ts

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface HistoricalSet {
  date: string;
  weight: number;
  reps: number;
  e1rm: number;
}

export interface CalendarDay {
  date: string;
  is_pr: boolean;
}

export interface ExerciseAnalyticsData {
  prStreakCount: number;
  daysSinceLastPR: number;
  bestSetAllTime: HistoricalSet | null;
  bestSetPreviousSession: HistoricalSet | null;
  historicalPRsList: HistoricalSet[];
  chartDataE1RM: ChartDataPoint[];
  chartDataAccumulatedVolume: ChartDataPoint[];
  calendarData: CalendarDay[];

  // [CORREÇÃO] Adicionando os campos opcionais para o Growth Hack de validação
  is_verified?: boolean;
  tags?: string[];
}

export interface CurrentBestSet {
  weight: number;
  reps: number;
  e1rm: number;
  definitionId: string; 
}

// Tipo direto da tabela exercise_statistics
export interface ExerciseStats {
  definition_id: string;
  max_weight: number;
  max_e1rm: number;
  total_sets: number;
  // Mapa de peso -> reps máximas (ex: { "100": 5 })
  max_reps_by_weight: Record<string, number>; 
  last_performed: string | null;
}