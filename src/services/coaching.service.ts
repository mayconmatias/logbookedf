import { supabase } from '@/lib/supabaseClient';
import { CoachingRelationship } from '@/types/coaching';
import { WorkoutHistoryItem } from '@/types/workout';

// Tipagem para mensagens
export interface CoachingMessage {
  id: string;
  relationship_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

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

  // 3. Busca o último treino de cada aluno
  const { data: lastWorkouts } = await supabase
    .from('workouts')
    .select('user_id, workout_date')
    .in('user_id', studentIds)
    .order('workout_date', { ascending: false });

  // 4. Mescla os dados
  const merged = relationships.map(rel => {
    const profile = profiles?.find(p => p.id === rel.student_id);
    
    // Encontra o treino mais recente desse aluno
    // Nota: Como a query retorna todos, precisamos filtrar ou pegar o primeiro encontrado se ordenado
    const lastWorkout = lastWorkouts?.find(w => w.user_id === rel.student_id);
    
    return {
      ...rel,
      student: profile ? {
        display_name: profile.display_name || 'Sem nome',
        email: profile.email || ''
      } : { display_name: 'Usuário desconhecido', email: '' },
      last_workout_date: lastWorkout?.workout_date || null
    };
  });

  return merged;
};

/**
 * Convite Inteligente:
 * 1. Verifica se o aluno já existe no banco.
 * 2. Se EXISTE: Vincula direto na tabela `coaching_relationships`.
 * 3. Se NÃO EXISTE: Chama a Edge Function para enviar e-mail de convite.
 */
export const inviteStudentByEmail = async (email: string) => {
  const emailTrimmed = email.trim().toLowerCase();

  // 1. Tenta encontrar usuário existente pelo RPC seguro
  const { data: foundUsers, error: searchError } = await supabase
    .rpc('get_profile_summary_by_email', { p_email: emailTrimmed });

  if (searchError) throw new Error(searchError.message);

  const profile = foundUsers && foundUsers.length > 0 ? foundUsers[0] : null;

  // --- CASO A: Usuário JÁ EXISTE no app ---
  if (profile) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === profile.id) throw new Error('Você não pode convidar a si mesmo.');

    const { error: insertError } = await supabase
      .from('coaching_relationships')
      .insert({
        coach_id: user?.id,
        student_id: profile.id,
        status: 'active'
      });

    if (insertError) {
      if (insertError.code === '23505') throw new Error('Este aluno já está vinculado a você.');
      throw insertError;
    }
    return { status: 'linked', message: `O aluno ${profile.display_name} foi vinculado com sucesso!` };
  }

  // --- CASO B: Usuário NÃO EXISTE (Novo Fluxo de Convite) ---
  else {
    // Busca nome do coach para personalizar o e-mail
    const { data: { user } } = await supabase.auth.getUser();
    const { data: coachProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user?.id)
      .single();
    
    const coachName = coachProfile?.display_name || 'Seu Treinador';

    // Chama a Edge Function para registrar convite e enviar e-mail
    const { data, error } = await supabase.functions.invoke('invite-student', {
      body: { email: emailTrimmed, coachName }
    });

    if (error) throw new Error('Erro ao enviar convite: ' + error.message);
    if (data?.error) throw new Error(data.error);

    return { status: 'invited', message: `Convite enviado para ${emailTrimmed}. O aluno aparecerá aqui assim que criar a conta.` };
  }
};

/**
 * Busca o histórico de treinos realizados de um aluno específico.
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
    .eq('user_id', studentId)
    .order('workout_date', { ascending: false })
    .limit(20);

  if (error) throw error;

  return data.map((workout: any) => {
    const [year, month, day] = workout.workout_date.split('-');
    const formattedDate = `${day}/${month}`;

    return {
      id: workout.id,
      workout_date: workout.workout_date,
      user_id: studentId,
      template_name: `Treino de ${formattedDate}`,
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
    .order('created_at', { ascending: false });

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

/**
 * Busca a última mensagem NÃO LIDA enviada pelo TREINADOR para o aluno logado.
 */
export const fetchUnreadCoachMessage = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rel } = await supabase
    .from('coaching_relationships')
    .select('id')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!rel) return null;

  const { data: msg } = await supabase
    .from('coaching_messages')
    .select('*')
    .eq('relationship_id', rel.id)
    .neq('sender_id', user.id)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return msg;
};

/**
 * Marca uma mensagem como lida.
 */
export const markMessageAsRead = async (messageId: string) => {
  const { error } = await supabase
    .from('coaching_messages')
    .update({ is_read: true })
    .eq('id', messageId);
    
  if (error) throw error;
};