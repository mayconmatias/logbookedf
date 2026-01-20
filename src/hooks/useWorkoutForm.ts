import { useState, useCallback, useEffect } from 'react';
import { SetType } from '@/types/workout';
import { LBS_TO_KG_FACTOR, calculateE1RM } from '@/utils/e1rm';

const KG_TO_LBS = 2.20462; 

const safeParse = (value: string): number => {
  if (!value) return 0;
  const clean = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

export const useWorkoutForm = (initialUnit: 'kg' | 'lbs' = 'kg') => {
  // Inputs
  const [exerciseName, setExerciseName] = useState('');
  const [definitionIdA, setDefinitionIdA] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  
  // Bi-set / Tri-set
  const [exerciseNameB, setExerciseNameB] = useState('');
  const [definitionIdB, setDefinitionIdB] = useState<string | null>(null);
  const [weightB, setWeightB] = useState('');
  const [repsB, setRepsB] = useState('');

  const [exerciseNameC, setExerciseNameC] = useState('');
  const [definitionIdC, setDefinitionIdC] = useState<string | null>(null);
  const [weightC, setWeightC] = useState('');
  const [repsC, setRepsC] = useState('');

  // Texto puro para observações
  const [observations, setObservations] = useState(''); 
  
  const [activeSetType, setActiveSetType] = useState<SetType>('normal');
  const [subSets, setSubSets] = useState<{ weight: string; reps: string }[]>([]);
  const [inputUnit, setInputUnit] = useState<'kg' | 'lbs'>(initialUnit);
  
  // Unilateral
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [side, setSide] = useState<'E' | 'D' | null>(null);
  const [isUnilateralB, setIsUnilateralB] = useState(false);
  const [sideB, setSideB] = useState<'E' | 'D' | null>(null);
  const [isUnilateralC, setIsUnilateralC] = useState(false);
  const [sideC, setSideC] = useState<'E' | 'D' | null>(null);
  
  const [isTemplateUnilateral, setIsTemplateUnilateral] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  // Substituição
  const [isSubstitutionMode, setIsSubstitutionMode] = useState(false);
  const [substitutionOriginalName, setSubstitutionOriginalName] = useState('');
  const [substitutionOriginalId, setSubstitutionOriginalId] = useState<string | null>(null);

  const [calculatedE1RMs, setCalculatedE1RMs] = useState({ A: 0, B: 0, C: 0 });

  // Detecção Unilateral
  useEffect(() => {
    if (editingSetId || !exerciseName) return;
    const lower = exerciseName.toLowerCase();
    const finalIsUnilateral = isTemplateUnilateral || lower.includes('unilateral') || lower.includes('uni ');
    if (finalIsUnilateral) { setIsUnilateral(true); if (!side) setSide('D'); } 
    else { setIsUnilateral(false); setSide(null); }
  }, [exerciseName, editingSetId, isTemplateUnilateral]); 

  // Consistência de Lados
  useEffect(() => { if (isUnilateral && !side) setSide('E'); else if (!isUnilateral) setSide(null); }, [isUnilateral]);
  useEffect(() => { if (isUnilateralB && !sideB) setSideB('E'); else if (!isUnilateralB) setSideB(null); }, [isUnilateralB]);
  useEffect(() => { if (isUnilateralC && !sideC) setSideC('E'); else if (!isUnilateralC) setSideC(null); }, [isUnilateralC]);

  // CÁLCULO DA TAG VISUAL (e1RM)
  const e1rmValueKG = safeParse(weight) > 0 && parseInt(reps) > 0 
    ? calculateE1RM(
        inputUnit === 'lbs' ? safeParse(weight) * LBS_TO_KG_FACTOR : safeParse(weight), 
        parseInt(reps), 
        safeParse(rpe) || undefined
      )
    : 0;

  let e1rmDisplayTag = '';
  if (e1rmValueKG > 0 && !['biset', 'triset', 'warmup'].includes(activeSetType)) {
      if (inputUnit === 'lbs') {
          e1rmDisplayTag = `${(e1rmValueKG * KG_TO_LBS).toFixed(1)} lbs`; 
      } else {
          e1rmDisplayTag = `${e1rmValueKG.toFixed(1)} kg`;
      }
  }

  // Atualiza objeto interno de cálculo
  useEffect(() => {
      setCalculatedE1RMs(prev => ({ ...prev, A: e1rmValueKG }));
  }, [e1rmValueKG]);

  // Actions
  const clearForm = useCallback(() => {
    setWeight(''); setReps(''); setRpe(''); setObservations(''); 
    setWeightB(''); setRepsB('');
    setWeightC(''); setRepsC('');
    setSubSets([]);
    setEditingSetId(null);
    setCalculatedE1RMs({ A: 0, B: 0, C: 0 });
    setIsSubstitutionMode(false);
    setSubstitutionOriginalName('');
    setSubstitutionOriginalId(null);
  }, []);

  const resetForNextSet = useCallback(() => {
    setReps(''); setRpe(''); setObservations(''); 
    setRepsB('');
    setRepsC('');
    setSubSets([]);
    setEditingSetId(null);
    setCalculatedE1RMs({ A: 0, B: 0, C: 0 });
    setIsSubstitutionMode(false);
    setSubstitutionOriginalName('');
    setSubstitutionOriginalId(null);
  }, []);

  const fullReset = useCallback(() => {
    setExerciseName(''); setDefinitionIdA(null);
    setExerciseNameB(''); setDefinitionIdB(null);
    setExerciseNameC(''); setDefinitionIdC(null);
    setActiveSetType('normal');
    setIsUnilateral(false); setSide(null);
    setIsUnilateralB(false); setSideB(null);
    setIsUnilateralC(false); setSideC(null);
    setIsTemplateUnilateral(false);
    clearForm();
  }, [clearForm]);

  // [CORREÇÃO DO CRASH] Função segura de toggle
  const toggleInputUnit = useCallback(() => {
    setInputUnit(prev => prev === 'kg' ? 'lbs' : 'kg');
  }, []);

  return {
    values: {
      exerciseName, definitionIdA, weight, reps, rpe, 
      observations, // Texto puro
      exerciseNameB, definitionIdB, weightB, repsB,
      exerciseNameC, definitionIdC, weightC, repsC,
      activeSetType, subSets, inputUnit, 
      isUnilateral, side, isTemplateUnilateral,
      isUnilateralB, sideB, isUnilateralC, sideC,
      editingSetId, calculatedE1RMs, 
      e1rmDisplayTag, // Tag visual
      isSubstitutionMode, substitutionOriginalName, substitutionOriginalId
    },
    setters: {
      setExerciseName, setDefinitionIdA, setWeight, setReps, setRpe, setObservations,
      setExerciseNameB, setDefinitionIdB, setWeightB, setRepsB,
      setExerciseNameC, setDefinitionIdC, setWeightC, setRepsC,
      setActiveSetType, setSubSets, 
      setIsUnilateral, setSide, setIsTemplateUnilateral,
      setIsUnilateralB, setSideB, setIsUnilateralC, setSideC,
      setEditingSetId,
      setIsSubstitutionMode, setSubstitutionOriginalName, setSubstitutionOriginalId
    },
    actions: { clearForm, fullReset, resetForNextSet, toggleInputUnit } // toggle aqui
  };
};