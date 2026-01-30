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
// 2. FUNÇÃO DE SUBSTITUIÇÃO (COM CORREÇÃO DE ORDEM)
// ============================================================

export const substituteExerciseInWorkout = async (
  workoutId: string,
  originalExerciseId: string,
  newDefinitionId: string
) => {
  // 1. Busca dados do exercício original para saber a posição (ordem)
  const { data: originalExercise, error: fetchError } = await supabase
    .from('exercises')
    .select('order_in_workout, notes, video_url, is_unilateral, sets(*)')
    .eq('id', originalExerciseId)
    .single();

  if (fetchError || !originalExercise) throw new Error("Exercício original não encontrado.");

  const currentOrder = originalExercise.order_in_workout;
  const newTargetOrder = currentOrder + 1;

  // 2. Empurra exercícios subsequentes para baixo para abrir espaço
  const { data: exercisesToShift } = await supabase
    .from('exercises')
    .select('id, order_in_workout')
    .eq('workout_id', workoutId)
    .gte('order_in_workout', newTargetOrder)
    .order('order_in_workout', { ascending: false });

  if (exercisesToShift && exercisesToShift.length > 0) {
    for (const ex of exercisesToShift) {
      await supabase
        .from('exercises')
        .update({ order_in_workout: ex.order_in_workout + 1 })
        .eq('id', ex.id);
    }
  }

  // 3. Verifica se o novo exercício é unilateral (baseado na definição)
  const { data: newDef } = await supabase
    .from('exercise_definitions')
    .select('is_unilateral, name')
    .eq('id', newDefinitionId)
    .single();

  const isNewUnilateral = newDef?.is_unilateral ||
    (newDef?.name?.toLowerCase().includes('unilateral')) ||
    false;

  // 4. Cria a instância do NOVO exercício na posição correta (logo abaixo do original)
  const { data: newExercise, error: createError } = await supabase
    .from('exercises')
    .insert({
      workout_id: workoutId,
      definition_id: newDefinitionId,
      order_in_workout: newTargetOrder,
      notes: originalExercise.notes, // Copia notas do original
      is_unilateral: isNewUnilateral,
      is_substitution: true,
      original_exercise_id: originalExerciseId
    })
    .select('id')
    .single();

  if (createError) throw new Error(createError.message);

  // 5. Copia e Migra as Séries
  if (originalExercise.sets && originalExercise.sets.length > 0) {
    // Ordena para garantir integridade sequencial
    const sortedSets = originalExercise.sets.sort((a: any, b: any) => a.set_number - b.set_number);

    const setsToClone = sortedSets.map((s: any) => ({
      exercise_id: newExercise.id,
      set_number: s.set_number,
      weight: s.weight, // Mantém carga planejada
      reps: s.reps,     // Mantém reps planejadas
      rpe: s.rpe,
      set_type: s.set_type,
      observations: s.observations,
      // Ajusta lado se a unilateralidade mudou
      side: isNewUnilateral ? (s.side || 'D') : null
    }));

    const { error: setsError } = await supabase.from('sets').insert(setsToClone);
    if (setsError) throw new Error("Erro ao copiar séries.");
  }

  // 6. Marca o exercício ANTIGO como substituído
  const { error: updateError } = await supabase
    .from('exercises')
    .update({ substituted_by_id: newExercise.id })
    .eq('id', originalExerciseId);

  if (updateError) throw new Error("Erro ao vincular substituição.");

  return newExercise.id;
};

// ============================================================
// 3. GERENCIAMENTO DE WORKOUTS E SÉRIES
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

// [ATUALIZADO] Reordenação que respeita Aquecimento no Topo
const reorderSetsInternal = async (exerciseId: string) => {
  const { data: sets, error } = await supabase
    .from('sets')
    .select('id, set_type, performed_at, created_at')
    .eq('exercise_id', exerciseId)
    .is('parent_set_id', null); // Ignora sub-sets de drop

  if (error || !sets) return;

  const sorted = sets.sort((a, b) => {
    // Regra 1: Warmup sempre antes de qualquer outro tipo
    const aIsWarmup = a.set_type === 'warmup';
    const bIsWarmup = b.set_type === 'warmup';

    if (aIsWarmup && !bIsWarmup) return -1;
    if (!aIsWarmup && bIsWarmup) return 1;

    // Regra 2: Desempate por data de criação (Cronológico)
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
  observations?: string; side?: 'E' | 'D' | null; set_type: SetType; subSets?: SubSetPayload[];
  music_data?: any;
}

export const saveComplexSet = async (params: SaveSetParams): Promise<WorkoutSet> => {
  const { data: parentSet, error } = await supabase
    .from('sets')
    .insert({
      exercise_id: params.exercise_id,
      set_number: params.set_type === 'warmup' ? 0 : 999, // Placeholder, será corrigido no reorder
      weight: params.weight,
      reps: params.reps,
      rpe: params.rpe,
      observations: params.observations,
      side: params.side,
      set_type: params.set_type,
      music_data: params.music_data
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
    super_set_id: superSetId,
    side: item.side
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
// 4. LÓGICA DE TEMPLATES (INSTANCIAÇÃO INTELIGENTE)
// ============================================================

export const instantiateTemplateInWorkout = async (
  workoutId: string,
  plannedExercises: PlannedExercise[]
) => {
  if (!plannedExercises || plannedExercises.length === 0) return;

  const setsPayload: any[] = [];

  for (let index = 0; index < plannedExercises.length; index++) {
    const plan = plannedExercises[index];

    // Detecção de Unilateralidade
    const lowerName = plan.definition_name?.toLowerCase() || '';
    const isUnilateral = plan.is_unilateral
      || lowerName.includes('unilateral')
      || lowerName.includes('uni ');

    // 1. Cria a instância do exercício (COPIANDO NOTES E VIDEO)
    const { data: exInstance, error: exError } = await supabase
      .from('exercises')
      .insert({
        workout_id: workoutId,
        definition_id: plan.definition_id,
        order_in_workout: index,
        notes: plan.notes || null,
        video_url: plan.video_url || null,
        is_unilateral: isUnilateral
      })
      .select('id')
      .single();

    if (exError) {
      console.error('Erro ao instanciar exercício:', exError);
      continue;
    }

    const count = plan.sets_count || 3;
    const rpeValue = plan.rpe_target ? parseFloat(plan.rpe_target) : null;

    if (isUnilateral) {
      for (let i = 1; i <= count; i++) {
        setsPayload.push({ exercise_id: exInstance.id, set_number: i, weight: 0, reps: 0, rpe: rpeValue, set_type: 'normal', side: 'D' });
        setsPayload.push({ exercise_id: exInstance.id, set_number: i, weight: 0, reps: 0, rpe: rpeValue, set_type: 'normal', side: 'E' });
      }
    } else {
      for (let i = 1; i <= count; i++) {
        setsPayload.push({ exercise_id: exInstance.id, set_number: i, weight: 0, reps: 0, rpe: rpeValue, set_type: 'normal', side: null });
      }
    }
  }

  if (setsPayload.length > 0) {
    const { error: setsError } = await supabase.from('sets').insert(setsPayload);
    if (setsError) throw new Error('Erro ao criar séries do template: ' + setsError.message);
  }
};

// ============================================================
// 5. IA E CLASSIFICAÇÃO
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