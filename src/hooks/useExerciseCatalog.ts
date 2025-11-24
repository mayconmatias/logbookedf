// src/hooks/useExerciseCatalog.ts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import {
  fetchUniqueExerciseCatalog,
  createExerciseDefinition, 
  renameExercise,
  mergeExercises,
  deleteExerciseHistory,
} from '@/services/exercises.service';
import { CatalogExerciseItem } from '@/types/catalog';
import t from '@/i18n/pt';

export const useExerciseCatalog = () => {
  const [loading, setLoading] = useState(true);
  const [allExercises, setAllExercises] = useState<CatalogExerciseItem[]>([]); // <--- INICIALIZADO AQUI
  const [searchTerm, setSearchTerm] = useState('');

  // 1. FUNÇÃO DE BUSCA CENTRALIZADA
  const loadCatalog = useCallback(async () => {
    try {
      const data = await fetchUniqueExerciseCatalog();
      setAllExercises(data);
      return data; 
    } catch (e: any) {
      Alert.alert(t.common.error, e.message);
    } finally {
      setLoading(false); 
    }
  }, []);

  // 2. BUSCA INICIAL
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // 3. FUNÇÃO DE CRIAÇÃO
  const handleCreateExercise = async (newExerciseName: string) => {
    if (!newExerciseName || newExerciseName.trim() === '') {
      Alert.alert(t.common.error, 'O nome não pode ficar em branco.');
      return null;
    }

    const nameTrimmed = newExerciseName.trim();
    const nameLowercase = nameTrimmed.toLowerCase();

    const existingExercise = allExercises.find(
      (ex) => ex.exercise_name_lowercase === nameLowercase
    );

    if (existingExercise) {
      Alert.alert(
        'Exercício já existe',
        `"${nameTrimmed}" já está no seu catálogo.`
      );
      return null;
    }

    try {
      const newDefinition = await createExerciseDefinition(nameTrimmed);
      Alert.alert('Sucesso', `"${nameTrimmed}" foi adicionado ao catálogo!`);

      const freshCatalog = await loadCatalog();
      setSearchTerm(''); 

      return freshCatalog?.find(
        (ex) => ex.exercise_id === newDefinition.id // (O service retorna 'id' da definição)
      );
    } catch (e: any) {
      Alert.alert('Erro ao Salvar', e.message);
      return null;
    }
  };

  // 4. FUNÇÕES DE GERENCIAMENTO
  const handleRenameExercise = async (
    definitionId: string,
    newName: string
  ) => {
    try {
      await renameExercise(definitionId, newName);
      Alert.alert('Sucesso', 'Exercício renomeado!');
      await loadCatalog(); 
      return true;
    } catch (e: any) {
      Alert.alert('Erro ao Renomear', e.message);
      return false;
    }
  };

  const handleMergeExercises = async (
    oldDefinitionId: string,
    targetDefinitionId: string
  ) => {
    try {
      await mergeExercises(oldDefinitionId, targetDefinitionId);
      Alert.alert('Sucesso', 'Exercícios mesclados!');
      await loadCatalog(); 
      return true;
    } catch (e: any) {
      Alert.alert('Erro ao Mesclar', e.message);
      return false;
    }
  };

  const handleDeleteExercise = async (
    definitionId: string,
    nameCapitalized: string
  ) => {
    try {
      await deleteExerciseHistory(definitionId);
      Alert.alert('Sucesso', `"${nameCapitalized}" foi apagado.`);
      await loadCatalog(); 
      return true;
    } catch (e: any) {
      Alert.alert('Erro ao Deletar', e.message);
      return false;
    }
  };

  // 5. LISTAS MEMORIZADAS
  const filteredExercises = useMemo(() => {
    if (!searchTerm) return allExercises;
    return allExercises.filter((ex) =>
      ex.exercise_name_lowercase.includes(searchTerm.toLowerCase())
    );
  }, [allExercises, searchTerm]);

  const allExerciseNames = useMemo(() => {
    return allExercises.map((ex) => ex.exercise_name_capitalized);
  }, [allExercises]);

  // 6. RETORNO (O PONTO IMPORTANTE)
  return {
    loading,
    allExercises, // <--- Esta linha é crucial para o 'LogWorkout.tsx'
    filteredExercises,
    allExerciseNames, // Esta linha é usada pelo 'WorkoutForm'
    loadCatalog,
    handleCreateExercise,
    handleRenameExercise,
    handleMergeExercises,
    handleDeleteExercise,
    searchTerm,
    setSearchTerm,
  };
};