import { supabase } from '@/lib/supabaseClient';
import { CatalogExerciseItem, ExerciseSetHistoryItem } from '@/types/catalog';
import { WorkoutSet, PerformancePeekData, SetType } from '@/types/workout';
import { generateUUID } from '@/utils/uuid';
import { PlannedExercise } from '@/types/coaching';

// ============================================================
// 1. GERENCIAMENTO DE CATÁLOGO E DEFINIÇÕES
// ============================================================

export const fetchUniqueExerciseCatalog = async (): Promise<CatalogExerciseItem[]> => {
  const { data, error } = await supabase.rpc('get_unique_exercise_catalog');
  if (error) throw new Error(error.message);
  return data || [];
};

export const createExerciseDefinition = async (name: string) => {
  const { data, error } = await supabase
    .from('exercise_definitions')
    .insert({ 
      name: name.trim(),
      user_id: (await supabase.auth.getUser()).data.user?.id 
    })
    .select('id, name, name_lowercase')
    .single();

  if (error) { 
    if (error.code === '23505') throw new Error(`O exercício "${name.trim()}" já existe.`); 
    throw new Error(error.message); 
  }

  // Lógica de IA/Cache Global
  const { data: globalData } = await supabase.rpc('find_global_tags_for_name', { p_name: name.trim() });
  const existingInfo = (globalData && globalData.length > 0) ? globalData[0] : null;

  if (existingInfo && existingInfo.tags && existingInfo.tags.length > 0) {
    await supabase
      .from('exercise_definitions')
      .update({ tags: existingInfo.tags, is_verified: existingInfo.is_verified })
      .eq('id', data.id);
  } else {
    classifyAndAuditExercise(name.trim()).then(async (classification) => {
      if (classification && classification.tags.length > 0) {
        await supabase
          .from('exercise_definitions')
          .update({ tags: classification.tags, is_verified: false })
          .eq('id', data.id);
      }
    });
  }
  return data;
};

export const renameExercise = async (definitionId: string, newName: string) => {
  const { error } = await supabase.rpc('rename_exercise_definition', { p_definition_id: definitionId, p_new_name: newName.trim(), });
  if (error) throw new Error(error.message);
};

export const mergeExercises = async (oldDefinitionId: string, targetDefinitionId: string) => {
  const { error } = await supabase.rpc('merge_exercise_definitions', { p_old_definition_id: oldDefinitionId, p_target_definition_id: targetDefinitionId, });
  if (error) throw new Error(error.message);
};

export const deleteExerciseHistory = async (definitionId: string) => {
  const { error } = await supabase.rpc('delete_exercise_definition', { p_definition_id: definitionId });
  if (error) throw new Error(error.message);
};

export const updateExerciseInstructions = async (definitionId: string, defaultNotes: string, videoUrl: string) => {
  const { error } = await supabase.from('exercise_definitions').update({ default_notes: defaultNotes, video_url: videoUrl }).eq('id', definitionId);
  if (error) throw new Error(error.message);
};

// ============================================================
// 2. GERENCIAMENTO DE WORKOUTS E SÉRIES
// ============================================================

export const getOrCreateExerciseInWorkout = async (workoutId: string, definitionId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('get_or_create_exercise_in_workout', { p_workout_id: workoutId, p_definition_id: definitionId });
  if (error) throw new Error(error.message);
  return data;
};

export const fetchExerciseSetHistory = async (definitionId: string): Promise<ExerciseSetHistoryItem[]> => {
  const { data, error } = await supabase.rpc('get_exercise_set_history', { p_definition_id: definitionId });
  if (error) throw new Error(error.message);
  return data || [];
};

// [CORREÇÃO AQUI]: Tipagem e chamada correta para a RPC de 3 argumentos
export const fetchPerformancePeek = async (
  definitionId: string, 
  sessionWorkoutId?: string,
  studentId?: string
): Promise<PerformancePeekData> => {
  const { data, error } = await supabase.rpc('fetch_performance_peek_by_def_id', {
    p_definition_id: definitionId,
    p_exclude_workout_id: sessionWorkoutId || null,
    p_target_user_id: studentId || null
  });

  if (error) throw new Error(error.message);
  return data as PerformancePeekData;
};

const reorderSetsInternal = async (exerciseId: string) => {
  const { data: sets, error } = await supabase
    .from('sets')
    .select('id, set_type, performed_at, created_at') 
    .eq('exercise_id', exerciseId)
    .is('parent_set_id', null);

  if (error || !sets) return;

  const sorted = sets.sort((a, b) => {
    const aIsWarmup = a.set_type === 'warmup';
    const bIsWarmup = b.set_type === 'warmup';
    if (aIsWarmup && !bIsWarmup) return -1;
    if (!aIsWarmup && bIsWarmup) return 1;
    const dateA = new Date(a.performed_at || a.created_at).getTime();
    const dateB = new Date(b.performed_at || b.created_at).getTime();
    return dateA - dateB;
  });

  const updates = sorted.map((s, index) => ({ id: s.id, set_number: index + 1 }));
  if (updates.length > 0) await supabase.from('sets').upsert(updates);
};

export interface SubSetPayload { weight: number; reps: number; }

interface SaveSetParams {
  exercise_id: string; set_number: number; weight: number; reps: number; rpe?: number;
  observations?: string; side?: 'E' | 'D'; set_type: SetType; subSets?: SubSetPayload[]; 
}

export const saveComplexSet = async (params: SaveSetParams): Promise<WorkoutSet> => {
  const { data: parentSet, error } = await supabase
    .from('sets')
    .insert({
      exercise_id: params.exercise_id,
      set_number: params.set_type === 'warmup' ? 0 : 999,
      weight: params.weight,
      reps: params.reps,
      rpe: params.rpe,
      observations: params.observations,
      side: params.side,
      set_type: params.set_type
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  if (params.subSets && params.subSets.length > 0) {
    const subSetsToInsert = params.subSets.map(sub => ({
      exercise_id: params.exercise_id,
      set_number: parentSet.set_number, 
      weight: sub.weight,
      reps: sub.reps,
      set_type: params.set_type, 
      parent_set_id: parentSet.id 
    }));
    await supabase.from('sets').insert(subSetsToInsert);
  }

  await reorderSetsInternal(params.exercise_id);
  return parentSet;
};

export const saveSuperSet = async (items: any[], setType: SetType) => {
  const superSetId = generateUUID();
  const setsToInsert = items.map(item => ({
    exercise_id: item.exercise_id,
    set_number: 999, 
    weight: item.weight,
    reps: item.reps,
    set_type: setType,
    super_set_id: superSetId 
  }));

  const { data, error } = await supabase.from('sets').insert(setsToInsert).select();
  if (error) throw new Error("Erro ao salvar Super-set: " + error.message);

  const uniqueExerciseIds = [...new Set(items.map(i => i.exercise_id))];
  for (const exId of uniqueExerciseIds) await reorderSetsInternal(exId as string);
  return data;
};

export const saveSet = async (data: any) => {
    return saveComplexSet({ ...data, set_type: data.set_type || 'normal', subSets: data.subSets || [] });
}

export const updateSet = async (setId: string, updates: Partial<WorkoutSet>) => {
  const { id, sessionWorkoutId, subSets, ...cleanUpdates } = updates;
  const { data, error } = await supabase.from('sets').update(cleanUpdates).eq('id', setId).select('*, exercise_id').single();
  if (error) throw new Error(error.message);
  if (data?.exercise_id) await reorderSetsInternal(data.exercise_id);
  return data;
};

export const deleteSet = async (setId: string) => {
  const { data: currentSet } = await supabase.from('sets').select('exercise_id').eq('id', setId).single();
  const { error } = await supabase.from('sets').delete().eq('id', setId);
  if (error) throw new Error(error.message);
  if (currentSet?.exercise_id) await reorderSetsInternal(currentSet.exercise_id);
};

export const deleteExercise = async (exerciseInstanceId: string) => {
  const { error } = await supabase.from('exercises').delete().eq('id', exerciseInstanceId);
  if (error) throw new Error(error.message);
};

export const reorderWorkoutExercises = async (updates: { id: string; order: number }[]) => {
  const { error } = await supabase.rpc('reorder_exercises', { p_updates: updates });
  if (error) throw new Error('Falha ao salvar a nova ordem: ' + error.message);
};

// ============================================================
// 3. LOGICA DE TEMPLATES (INSTANCIAÇÃO) -- CORRIGIDA
// ============================================================

export const instantiateTemplateInWorkout = async (
  workoutId: string, 
  plannedExercises: PlannedExercise[]
) => {
  if (!plannedExercises || plannedExercises.length === 0) return;

  // 1. Prepara o Payload de Exercícios respeitando a ordem do Array
  const exercisesPayload = plannedExercises.map((plan, index) => ({
    workout_id: workoutId,
    definition_id: plan.definition_id,
    order_in_workout: index // Garante a ordem visual
  }));

  // 2. Inserção em LOTE (Bulk Insert) e retorna os dados criados
  const { data: createdExercises, error: exError } = await supabase
    .from('exercises')
    .insert(exercisesPayload)
    .select('id, definition_id'); // Precisamos dos IDs gerados

  if (exError) throw new Error('Erro ao criar exercícios do template: ' + exError.message);
  if (!createdExercises || createdExercises.length === 0) return;

  // 3. Criação dos Sets em LOTE
  const setsPayload: any[] = [];

  // Mapeia os exercícios criados de volta para o planejamento original
  // Nota: Isso assume que o banco retorna na mesma ordem ou usamos definition_id para match
  // Para segurança total, iteramos sobre o que foi criado.
  createdExercises.forEach(exInstance => {
    // Encontra o plano correspondente (pode haver duplicatas de definition_id num treino, 
    // mas num template simples assumimos match pelo ID ou ordem. 
    // Aqui usamos uma lógica simples: encontrar o primeiro plan que bate o ID)
    const plan = plannedExercises.find(p => p.definition_id === exInstance.definition_id);
    
    if (plan) {
      const count = plan.sets_count || 3;
      for (let i = 1; i <= count; i++) {
        setsPayload.push({
          exercise_id: exInstance.id,
          set_number: i,
          weight: 0,
          reps: 0,
          rpe: plan.rpe_target ? parseFloat(plan.rpe_target) : null,
          set_type: 'normal'
        });
      }
    }
  });

  if (setsPayload.length > 0) {
    const { error: setsError } = await supabase.from('sets').insert(setsPayload);
    if (setsError) throw new Error('Erro ao criar séries do template: ' + setsError.message);
  }
};

// ============================================================
// 4. IA E CLASSIFICAÇÃO
// ============================================================

export interface ExerciseClassification {
  tags: string[];
  standardized_name: string;
  audit: {
    risk_score: number;
    merit_score: number;
    red_flags: { type: string; message: string }[];
    green_flags: { type: string; message: string }[];
  };
}

export const classifyAndAuditExercise = async (text: string): Promise<ExerciseClassification | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('classify-exercise', {
      body: { text, type: 'exercise_name' }
    });
    if (error) return null;
    return data as ExerciseClassification;
  } catch (e) {
    return null;
  }
};

export const autoClassifyExistingExercises = async (forceAll = false) => {
  let processedCount = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabase.from('exercise_definitions').select('id, name');
    if (!forceAll) query = query.is('tags', null);
    const { data: exercises } = await query.limit(10); 
    if (!exercises || exercises.length === 0) { hasMore = false; break; }
    const promises = exercises.map(async (ex) => {
      const classification = await classifyAndAuditExercise(ex.name);
      if (classification && classification.tags.length > 0) {
        await supabase.from('exercise_definitions').update({ tags: classification.tags }).eq('id', ex.id);
        return 1;
      }
      return 0;
    });
    const results = await Promise.all(promises);
    processedCount += results.reduce((a: number, b: number) => a + b, 0);
    if (exercises.length < 10 || processedCount >= 500) hasMore = false; 
  }
  return processedCount;
};

export const validateExerciseClassification = async (definitionId: string, isCorrect: boolean, correctedTag?: string) => {
  const updates: any = { is_verified: true };
  if (!isCorrect && correctedTag) updates.tags = [correctedTag];
  const { error } = await supabase.from('exercise_definitions').update(updates).eq('id', definitionId);
  if (error) throw new Error(error.message);
};