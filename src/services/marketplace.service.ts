import { supabase } from '@/lib/supabaseClient';
import { Program } from '@/types/coaching';

/**
 * Busca todos os programas disponíveis na vitrine.
 */
export const fetchMarketplacePrograms = async (): Promise<Program[]> => {
  const { data, error } = await supabase
    .from('programs')
    .select('*, coach:profiles!coach_id(display_name)') // Traz o nome do criador
    .eq('is_template', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Mapeia para incluir o nome do autor se disponível
  return data.map((item: any) => ({
    ...item,
    author_name: item.coach?.display_name || 'Escola de Força'
  }));
};

/**
 * Clona (compra) um programa para o usuário atual.
 */
export const acquireProgram = async (templateId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não logado.');

  // Chama a RPC poderosa que criamos
  const { data, error } = await supabase.rpc('clone_program', {
    p_template_id: templateId,
    p_target_user_id: user.id
  });

  if (error) throw error;
  return data; // Retorna o ID do novo programa
};