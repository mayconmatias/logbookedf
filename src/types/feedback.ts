// src/types/feedback.ts

import { Tables } from "./supabase"; // Assumindo que você tem tipos gerados para o Supabase

/**
 * Interface para uma mensagem individual no chat (Aluno/Coach).
 */
export interface ExerciseMessage {
  id: string;
  created_at: string; // Para a data (3.2)
  sender_id: string; // ID do usuário que enviou a mensagem (Aluno ou Coach)
  sender_role: 'aluno' | 'coach';
  message: string;
  // Opcional, se quisermos amarrar a uma sessão específica além da definição:
  workout_id: string | null; 
}

/**
 * Estrutura para os dados estáticos (Instruções do Coach/Catálogo).
 */
export type ExerciseStaticData = Pick<
  Tables<'exercise_definitions'>,
  'default_notes' | 'video_url'
>;