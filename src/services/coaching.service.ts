import { supabase } from '@/lib/supabaseClient';
import { CoachingRelationship } from '@/types/coaching';
import { WorkoutHistoryItem } from '@/types/workout';

/**
 * Busca alunos vinculados e a data do último treino realizado.
 */
export const fetchMyStudents = async (): Promise<CoachingRelationship[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  // 1. Busca os relacionamentos
  const { data: relationships, error: relError } = await supabase
    .from('coaching_relationships')
    .select('*')
    .eq('coach_id', user.id);

  if (relError) throw relError;
  if (!relationships || relationships.length === 0) return [];

  const studentIds = relationships.map(r => r.student_id);

  // 2. Busca perfis (nomes)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .in('id', studentIds);

  // 3. [NOVO] Busca o último treino de cada aluno
  // Usamos uma query agregada ou buscamos o último workout de cada ID
  const { data: lastWorkouts } = await supabase
    .from('workouts')
    .select('user_id, workout_date')
    .in('user_id', studentIds)
    .order('workout_date', { ascending: false });

  // 4. Mescla os dados
  const merged = relationships.map(rel => {
    const profile = profiles?.find(p => p.id === rel.student_id);
    
    // Encontra o treino mais recente desse aluno
    const lastWorkout = lastWorkouts?.find(w => w.user_id === rel.student_id);
    
    return {
      ...rel,
      student: profile ? {
        display_name: profile.display_name || 'Sem nome',
        email: profile.email || ''
      } : { display_name: 'Usuário desconhecido', email: '' },
      // Adicionamos essa prop dinamicamente (você pode adicionar no tipo CoachingRelationship se quiser tipagem estrita)
      last_workout_date: lastWorkout?.workout_date || null
    };
  });

  return merged;
};

/**
 * Convida um aluno pelo E-mail.
 * Requer que o aluno já tenha cadastro no app (exista na tabela profiles).
 */
export const inviteStudentByEmail = async (email: string) => {
  const emailTrimmed = email.trim().toLowerCase();

  // 1. Encontrar o ID do aluno pelo email (na tabela profiles)
  const { data: foundUsers, error: searchError } = await supabase
    .rpc('get_profile_summary_by_email', {
      p_email: emailTrimmed
    });

  if (searchError) {
    throw new Error('Erro ao buscar aluno: ' + searchError.message);
  }

  // A RPC retorna um array (tabela), pegamos o primeiro item
  const profile = foundUsers && foundUsers.length > 0 ? foundUsers[0] : null;

  if (!profile) {
    throw new Error('Aluno não encontrado. Verifique o e-mail ou peça para ele se cadastrar.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Você não está logado.');

  if (profile.id === user.id) {
    throw new Error('Você não pode ser seu próprio aluno.');
  }

  // 2. Criar o relacionamento
  const { error: insertError } = await supabase
    .from('coaching_relationships')
    .insert({
      coach_id: user.id,
      student_id: profile.id,
      status: 'active' // MVP: Já cria como ativo. No futuro pode ser 'pending'.
    });

  if (insertError) {
    if (insertError.code === '23505') { // Unique violation
      throw new Error('Este aluno já está na sua lista.');
    }
    throw insertError;
  }
};

/**
 * Busca o histórico de treinos realizados de um aluno específico.
 * (O Coach tem permissão para ver isso graças à policy que criamos).
 */
export const fetchStudentHistory = async (studentId: string): Promise<WorkoutHistoryItem[]> => {
  const { data, error } = await supabase
    .from('workouts')
    .select(`
      id, 
      workout_date,
      exercises ( 
        id, 
        definition_id,
        definition:exercise_definitions ( name ),
        sets ( weight, reps, rpe ) 
      )
    `)
    .eq('user_id', studentId) // Filtra pelo ID do aluno
    .order('workout_date', { ascending: false }) // Mais recentes primeiro
    .limit(20); // Limita para não pesar

  if (error) throw error;

  // Formata para o tipo WorkoutHistoryItem
  return data.map((workout: any) => {
    // Tenta identificar o nome do treino (se veio de template ou data)
    const [year, month, day] = workout.workout_date.split('-');
    const formattedDate = `${day}/${month}`;

    return {
      id: workout.id,
      workout_date: workout.workout_date,
      user_id: studentId,
      template_name: `Treino de ${formattedDate}`, // Nome simplificado
      performed_data: workout.exercises.map((ex: any) => ({
        id: ex.id,
        definition_id: ex.definition_id,
        name: ex.definition ? ex.definition.name : 'Exercício',
        sets: ex.sets || [],
      })),
    };
  });
};

/**
 * Busca a lista de exercícios únicos que um aluno já realizou.
 */
export const fetchStudentUniqueExercises = async (studentId: string) => {
  const { data, error } = await supabase.rpc('get_student_unique_exercises', {
    p_student_id: studentId
  });

  if (error) throw error;
  return data as { definition_id: string; name: string }[] || [];
};

export interface CoachingMessage {
  id: string;
  relationship_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

/**
 * Busca a mensagem mais recente para exibir no topo do Dashboard.
 */
export const fetchLatestCoachMessage = async (relationshipId: string): Promise<CoachingMessage | null> => {
  const { data, error } = await supabase
    .from('coaching_messages')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Busca o histórico completo de mensagens.
 */
export const fetchMessageHistory = async (relationshipId: string): Promise<CoachingMessage[]> => {
  const { data, error } = await supabase
    .from('coaching_messages')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: false }); // Mais recentes primeiro

  if (error) throw error;
  return data || [];
};

/**
 * Envia uma nova mensagem.
 */
export const sendCoachingMessage = async (relationshipId: string, content: string) => {
  const { error } = await supabase
    .from('coaching_messages')
    .insert({
      relationship_id: relationshipId,
      content: content.trim()
    });

  if (error) throw error;
};

// Adicione ao final do arquivo src/services/coaching.service.ts

/**
 * Busca a última mensagem NÃO LIDA enviada pelo TREINADOR para o aluno logado.
 */
export const fetchUnreadCoachMessage = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1. Acha o relacionamento ativo onde sou aluno
  const { data: rel } = await supabase
    .from('coaching_relationships')
    .select('id')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!rel) return null;

  // 2. Busca mensagem não lida que NÃO fui eu que enviei (logo, foi o coach)
  const { data: msg } = await supabase
    .from('coaching_messages')
    .select('*')
    .eq('relationship_id', rel.id)
    .neq('sender_id', user.id) // Garante que não é msg minha
    .eq('is_read', false)      // Apenas não lidas
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return msg;
};

/**
 * Marca uma mensagem como lida (Dismiss)
 */
export const markMessageAsRead = async (messageId: string) => {
  const { error } = await supabase
    .from('coaching_messages')
    .update({ is_read: true })
    .eq('id', messageId);
    
  if (error) throw error;
};