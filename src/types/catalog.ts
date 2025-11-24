/**
 * Define o formato de um item na lista principal do catálogo.
 * (Retorno do RPC 'get_unique_exercise_catalog')
 */
export interface CatalogExerciseItem {
  exercise_id: string; // <-- O ID que faltava
  exercise_name_capitalized: string; // <-- O nome para exibição
  exercise_name_lowercase: string; // <-- O nome para pesquisa
  last_performed: string; // ISO date string
  total_sets: number;
  default_notes?: string;
  video_url?: string;
}

/**
 * Define o formato de uma única série no histórico corrido (o "ninho").
 * (Retorno do RPC 'get_exercise_set_history')
 */
export interface ExerciseSetHistoryItem {
  workout_date: string; // ISO date string
  set_number: number;
  weight: number;
  reps: number;
  is_pr: boolean;
}