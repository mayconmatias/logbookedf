export interface CatalogExerciseItem {
  exercise_id: string;
  exercise_name_capitalized: string;
  exercise_name_lowercase: string;
  last_performed: string; 
  total_sets: number;
  default_notes?: string;
  video_url?: string; // [NOVO]
  tags?: string[];
  is_system: boolean; // [NOVO] Identifica se é do app ou do usuário
}

export interface ExerciseSetHistoryItem {
  workout_date: string;
  set_number: number;
  weight: number;
  reps: number;
  is_pr: boolean;
}