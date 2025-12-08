import { supabase } from '@/lib/supabaseClient';

export interface VolumeStatItem {
  label: string;
  weekly_sets: number;    
  last_week_sets: number; 
}

export interface DashboardStats {
  tag_stats: VolumeStatItem[];      
  exercise_stats: VolumeStatItem[]; 
  
  evolution_trend: { 
    date: string; 
    volume: number;
    sets: number;
    density: number;
  }[];

  evolution_daily: { 
    date: string; 
    volume: number;
    sets: number;
    density: number;
  }[];

  time_stats: {
    avg_session_minutes: number;
    sets_min: number;
    sets_max: number;
    rest_min_seconds: number;
    rest_max_seconds: number;
  };

  last_checkin: {
    total_score: number;
    ai_insight: string;
    date: string;
  } | null;

  current_streak: number;
  consistency_matrix: string[]; 
}

export interface CheckinPayload {
  source_routine: number;
  source_sleep: number;
  symptom_energy: number;
  symptom_motivation: number;
  symptom_focus: number;
}

export const fetchDashboardStats = async (
  setTypes?: string[],
  programId?: string | null
): Promise<DashboardStats> => {
  const defaultTypes = ['normal', 'drop', 'rest_pause', 'cluster', 'biset', 'triset'];

  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    p_set_types: setTypes || defaultTypes,
    p_program_id: programId || null
  });
  
  if (error) throw error;
  return data as DashboardStats;
};

export const submitDailyCheckin = async (payload: CheckinPayload) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');

  const { data, error } = await supabase
    .from('daily_checkins')
    .insert({ user_id: user.id, ...payload })
    .select().single();

  if (error) throw error;
  return data;
};