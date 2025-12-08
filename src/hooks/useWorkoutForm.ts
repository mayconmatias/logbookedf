// src/hooks/useWorkoutForm.ts

import { useState, useCallback } from 'react';
import { SetType } from '@/types/workout';
import { LBS_TO_KG_FACTOR, calculateE1RM } from '@/utils/e1rm';

export const useWorkoutForm = (initialUnit: 'kg' | 'lbs' = 'kg') => {
  // Inputs Principais (Exercício A)
  const [exerciseName, setExerciseName] = useState('');
  const [definitionIdA, setDefinitionIdA] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [observations, setObservations] = useState('');
  
  // Inputs Secundários (Bi-set / Tri-set)
  const [exerciseNameB, setExerciseNameB] = useState('');
  const [definitionIdB, setDefinitionIdB] = useState<string | null>(null);
  const [weightB, setWeightB] = useState('');
  const [repsB, setRepsB] = useState('');

  const [exerciseNameC, setExerciseNameC] = useState('');
  const [definitionIdC, setDefinitionIdC] = useState<string | null>(null);
  const [weightC, setWeightC] = useState('');
  const [repsC, setRepsC] = useState('');

  // Configurações
  const [activeSetType, setActiveSetType] = useState<SetType>('normal');
  const [subSets, setSubSets] = useState<{ weight: string; reps: string }[]>([]);
  const [inputUnit, setInputUnit] = useState<'kg' | 'lbs'>(initialUnit);
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [side, setSide] = useState<'E' | 'D' | null>(null);
  
  // Estado de Edição
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  // --- Ações ---

  const clearForm = useCallback(() => {
    // Limpa apenas os dados de série (mantém nome e tipo)
    setWeight(''); setReps(''); setRpe(''); setObservations(''); 
    setWeightB(''); setRepsB('');
    setWeightC(''); setRepsC('');
    setSubSets([]);
    setEditingSetId(null);
  }, []);

  const fullReset = useCallback(() => {
    setExerciseName(''); setDefinitionIdA(null);
    setExerciseNameB(''); setDefinitionIdB(null);
    setExerciseNameC(''); setDefinitionIdC(null);
    setActiveSetType('normal');
    setIsUnilateral(false);
    setSide(null);
    clearForm();
  }, [clearForm]);

  // Calcula e1RM em tempo real para a observação
  const getAutoObservation = useCallback((baseObservation: string) => {
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (!w || !r) return baseObservation;
    
    let wKg = inputUnit === 'lbs' ? w * LBS_TO_KG_FACTOR : w;
    const val = calculateE1RM(wKg, r);
    const newBase = val ? `e1RM: ${val.toFixed(1)} kg` : '';
    
    // Retorna o novo e1RM ou mantém a observação original se não houver cálculo.
    return newBase || baseObservation;

  }, [weight, reps, inputUnit]);

  return {
    values: {
      exerciseName, definitionIdA, weight, reps, rpe, observations,
      exerciseNameB, definitionIdB, weightB, repsB,
      exerciseNameC, definitionIdC, weightC, repsC,
      activeSetType, subSets, inputUnit, isUnilateral, side, editingSetId
    },
    setters: {
      setExerciseName, setDefinitionIdA, setWeight, setReps, setRpe, setObservations,
      setExerciseNameB, setDefinitionIdB, setWeightB, setRepsB,
      setExerciseNameC, setDefinitionIdC, setWeightC, setRepsC,
      setActiveSetType, setSubSets, setInputUnit, setIsUnilateral, setSide, setEditingSetId
    },
    actions: {
      clearForm,
      fullReset,
      getAutoObservation
    }
  };
};