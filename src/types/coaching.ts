import { SetType } from './workout';

export type CoachingStatus = 'active' | 'pending' | 'archived';

export interface CoachingRelationship {
  id: string;
  coach_id: string;
  student_id: string;
  status: CoachingStatus;
  created_at: string;
  
  coach?: {
    display_name: string;
    email: string;
  };
  student?: {
    display_name: string;
    email: string;
  };

  last_workout_date?: string | null; 
}

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
  
  // [NOVO] Datas de Vigência
  starts_at?: string | null; // ISO Date '2024-01-01'
  expires_at?: string | null; // ISO Date '2024-02-01'
  
  coach?: {
    display_name: string;
  };
}

export interface PlannedWorkout {
  id: string;
  program_id: string;
  name: string;
  day_order: number;
  created_at: string;
  exercises?: PlannedExercise[];
}

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
  
  video_url?: string | null;

  set_type?: SetType; 

  definition?: {
    name: string;
  };
  definition_name?: string;
  is_unilateral?: boolean;
}