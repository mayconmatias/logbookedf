import { supabase } from '@/lib/supabaseClient';
import { Program } from '@/types/coaching';

/**
 * Busca todos os programas de um aluno específico.
 * Ordenado por data de criação (mais recentes primeiro).
 */
export const fetchStudentPrograms = async (studentId: string): Promise<Program[]> => {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

/**
 * Cria um novo programa de treino.
 * * Lógica Híbrida:
 * 1. Se studentId == usuário logado -> Usa RPC 'create_autoral_program' (Valida limite Free vs Pro).
 * 2. Se studentId != usuário logado -> Assume que é um Coach criando para o aluno (Insert direto).
 */
export const createProgram = async (studentId: string, name: string): Promise<Program> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  // --- CENÁRIO 1: Usuário criando para si mesmo (Self-Coaching) ---
  if (studentId === user.id) {
    // Chama a função do banco que verifica se ele já estourou o limite do plano Free
    const { data, error } = await supabase.rpc('create_autoral_program', {
      p_name: name
    });

    if (error) {
      // O erro do banco virá como "Limite atingido...", o front-end captura isso
      throw new Error(error.message);
    }
    return data as Program;
  } 
  
  // --- CENÁRIO 2: Coach criando para um aluno ---
  else {
    const { data, error } = await supabase
      .from('programs')
      .insert({
        coach_id: user.id,
        student_id: studentId,
        name: name.trim(),
        is_active: false,   // Cria inativo para não substituir o treino atual do aluno sem querer
        is_template: false
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }
};

/**
 * Define um programa como o ÚNICO ativo na Home do aluno.
 * Usa a RPC 'activate_program' que garante atomicidade (desativa os outros e ativa este).
 */
export const setProgramActive = async (programId: string) => {
  const { error } = await supabase.rpc('activate_program', {
    p_program_id: programId
  });
  
  if (error) throw error;
};