// src/types/coaching.ts

export type CoachingStatus = 'active' | 'pending' | 'archived';

/**
 * Tabela: coaching_relationships
 */
export interface CoachingRelationship {
  id: string;
  coach_id: string;
  student_id: string;
  status: CoachingStatus;
  created_at: string;
  
  // Campos opcionais vindos de Joins (para exibir nomes na UI)
  coach?: {
    display_name: string;
    email: string;
  };
  student?: {
    display_name: string;
    email: string;
  };

  // [NOVO] Campo calculado via service para mostrar status (verde/amarelo/vermelho)
  last_workout_date?: string | null; 
}

/**
 * Tabela: programs
 */
export interface Program {
  id: string;
  coach_id: string;
  student_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  is_template: boolean;
  price?: number;
  author_name?: string;
  origin_template_id?: string | null;
  
  // Se houver join com o perfil do coach
  coach?: {
    display_name: string;
  };
}

/**
 * Tabela: planned_workouts
 */
export interface PlannedWorkout {
  id: string;
  program_id: string;
  name: string;
  day_order: number;
  created_at: string;
  exercises?: PlannedExercise[];
}

/**
 * Tabela: planned_exercises
 */
export interface PlannedExercise {
  id: string;
  planned_workout_id: string;
  definition_id: string;
  order_index: number;
  sets_count: number | null;
  reps_range: string | null;
  rpe_target: string | null;
  rest_seconds: number | null;
  notes: string | null;

  // Campos de visualização (joins)
  definition?: {
    name: string;
  };
  definition_name?: string; // Usado em alguns contextos flat
}