import { supabase } from '@/lib/supabaseClient';

export interface EvolutionPoint {
  date: string;
  label: string;
  volume: number;
  avgReps: number;
}

export const fetchMacroEvolutionData = async (
  studentId: string, 
  grouping: 'week' | 'month',
  filterType: 'muscle_group' | 'exercise',
  filterValue: string 
): Promise<EvolutionPoint[]> => {
  
  let query = supabase
    .from('sets')
    .select(`
      weight,
      reps,
      performed_at, 
      exercise:exercises!inner (
        definition:exercise_definitions!inner (
            id,
            name,
            tags 
        ),
        workout:workouts!inner (
            user_id,
            workout_date,
            ended_at
        )
      )
    `)
    .eq('exercise.workout.user_id', studentId)
    .not('exercise.workout.ended_at', 'is', null) 
    .gt('weight', 0)
    .gt('reps', 0)
    .order('performed_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Erro Evolution Service:', error);
    throw error;
  }

  const rawPoints: Record<string, { totalVol: number; totalReps: number; countSets: number }> = {};

  data?.forEach((row: any) => {
    const def = row.exercise?.definition;
    const workoutData = row.exercise?.workout;
    
    if (!def || !workoutData) return;

    const dateStr = workoutData.workout_date;
    
    // FILTRO
    if (filterType === 'muscle_group') {
        const hasTag = def.tags && Array.isArray(def.tags) && def.tags.includes(filterValue);
        if (!hasTag) return;
    } 
    else if (filterType === 'exercise' && def.id !== filterValue) {
        return;
    }

    // AGRUPAMENTO
    let key = '';
    const d = new Date(dateStr);
    
    if (grouping === 'week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day == 0 ? -6 : 1); 
      const monday = new Date(d.setDate(diff));
      key = monday.toISOString().split('T')[0];
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!rawPoints[key]) rawPoints[key] = { totalVol: 0, totalReps: 0, countSets: 0 };
    
    const vol = (row.weight || 0) * (row.reps || 0);
    rawPoints[key].totalVol += vol;
    rawPoints[key].totalReps += (row.reps || 0);
    rawPoints[key].countSets += 1;
  });

  // 3. Mapeamento Final (CÁLCULO ALTERADO AQUI)
  return Object.entries(rawPoints)
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([date, stats], index) => ({
      date,
      label: grouping === 'week' ? `S${index + 1}` : date,
      
      // [MUDANÇA] VTT Médio = Volume Total / Número de Séries
      volume: stats.countSets > 0 ? Math.round(stats.totalVol / stats.countSets) : 0,
      
      avgReps: stats.countSets > 0 ? Math.round(stats.totalReps / stats.countSets) : 0
    }));
};