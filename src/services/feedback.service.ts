// src/services/feedback.service.ts

import { supabase } from '@/lib/supabaseClient';
import { ExerciseMessage } from '@/types/feedback';
import { Tables } from '@/types/supabase'; // Assumindo tipagem supabase

const FEEDBACK_TABLE = 'exercise_messages';

/**
 * Busca o histórico de mensagens para um exercício e um usuário.
 * @param definitionId ID da definição do exercício (o que amarra a mensagem ao exercício).
 * @param targetUserId ID do aluno (para segmentar o histórico daquele aluno específico).
 */
export async function fetchMessages(
  definitionId: string,
  targetUserId: string
): Promise<ExerciseMessage[]> {
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select('*')
    .eq('exercise_definition_id', definitionId)
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar feedback:', error);
    return [];
  }

  // Mapeia para a interface ExerciseMessage
  return data.map(item => ({
    id: item.id,
    created_at: item.created_at,
    sender_id: item.sender_id,
    sender_role: item.sender_role as 'aluno' | 'coach',
    message: item.message,
    workout_id: item.workout_id || null,
  })) as ExerciseMessage[];
}

/**
 * Envia uma nova mensagem (observação do aluno ou feedback do coach).
 */
export async function sendMessage(
  definitionId: string,
  targetUserId: string, // ID do aluno
  senderId: string, // ID do remetente
  message: string,
  senderRole: 'aluno' | 'coach'
) {
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .insert({
      exercise_definition_id: definitionId,
      user_id: targetUserId,
      sender_id: senderId,
      sender_role: senderRole,
      message: message,
      // created_at é setado automaticamente pelo banco
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao enviar mensagem:', error);
    throw new Error('Falha ao registrar mensagem.');
  }
  return data;
}

// [OPCIONAL]: Função para buscar notas e vídeo estáticos (mantemos em LogWorkout por enquanto)