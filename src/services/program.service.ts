import { supabase } from '@/lib/supabaseClient';
import { Program } from '@/types/coaching';

/**
 * Busca todos os programas de um aluno específico.
 */
export const fetchStudentPrograms = async (studentId: string): Promise<Program[]> => {
  // [CORREÇÃO] Seleção explícita de colunas para evitar falhas de RLS/Join
  const { data, error } = await supabase
    .from('programs')
    .select(`
      id,
      name,
      description,
      is_active,
      is_template,
      created_at,
      origin_template_id,
      coach_id,
      student_id
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Erro ao buscar programas:", error);
    throw error;
  }
  return data || [];
};

/**
 * Cria um novo programa de treino.
 */
export const createProgram = async (studentId: string, name: string): Promise<Program> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  if (studentId === user.id) {
    const { data, error } = await supabase.rpc('create_autoral_program', {
      p_name: name
    });
    if (error) throw new Error(error.message);
    return data as Program;
  } else {
    const { data, error } = await supabase
      .from('programs')
      .insert({
        coach_id: user.id,
        student_id: studentId,
        name: name.trim(),
        is_active: false,
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
 */
export const setProgramActive = async (programId: string) => {
  const { error } = await supabase.rpc('activate_program', {
    p_program_id: programId
  });
  if (error) throw error;
};

/**
 * Renomeia um programa existente.
 */
export const renameProgram = async (programId: string, newName: string) => {
  const { error } = await supabase
    .from('programs')
    .update({ name: newName.trim() })
    .eq('id', programId);
  if (error) throw error;
};

/**
 * Deleta um programa.
 */
export const deleteProgram = async (programId: string) => {
  const { error } = await supabase
    .from('programs')
    .delete()
    .eq('id', programId);
  if (error) throw error;
};