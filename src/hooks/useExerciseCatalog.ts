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
  const [allExercises, setAllExercises] = useState<CatalogExerciseItem[]>([]); 
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado para controlar a tag selecionada (null = Todos)
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleCreateExercise = async (
    newExerciseName: string, 
    options?: { silent?: boolean }
  ) => {
    if (!newExerciseName || newExerciseName.trim() === '') {
      Alert.alert(t.common.attention, 'O nome não pode ficar em branco.');
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
      return existingExercise; 
    }

    try {
      const newDefinition = await createExerciseDefinition(nameTrimmed);
      
      if (!options?.silent) {
        Alert.alert('Sucesso', `"${nameTrimmed}" foi adicionado ao catálogo!`);
      }

      const freshCatalog = await loadCatalog();
      setSearchTerm(''); 

      return freshCatalog?.find(
        (ex) => ex.exercise_id === newDefinition.id 
      );
    } catch (e: any) {
      Alert.alert('Erro ao Salvar', e.message);
      return null;
    }
  };

  const handleRenameExercise = async (definitionId: string, newName: string) => {
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

  const handleMergeExercises = async (oldDefinitionId: string, targetDefinitionId: string) => {
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

  const handleDeleteExercise = async (definitionId: string, nameCapitalized: string) => {
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

  // [ATUALIZADO] Gera lista de filtros baseada nos Pacotes Comprados
  const availableTags = useMemo(() => {
    const tagsSet = new Set<string>();
    
    // Varre todos os exercícios para encontrar tags existentes (Pacotes)
    allExercises.forEach(ex => {
      if (ex.tags && Array.isArray(ex.tags)) {
        ex.tags.forEach(tag => tagsSet.add(tag));
      }
    });

    const sortedPacks = Array.from(tagsSet).sort();

    // Sempre adiciona "Meus" para exercícios manuais (sem tag)
    return ['Meus', ...sortedPacks];
  }, [allExercises]);

  // [ATUALIZADO] Lógica de filtragem por Pacote
  const filteredExercises = useMemo(() => {
    let result = allExercises;

    // 1. Filtro por Tag (Pacote)
    if (selectedTag) {
      if (selectedTag === 'Meus') {
        // Mostra exercícios que NÃO têm tags (criados manualmente)
        result = result.filter(ex => !ex.tags || ex.tags.length === 0);
      } else {
        // Mostra exercícios que têm a tag específica do pacote
        result = result.filter(ex => ex.tags && ex.tags.includes(selectedTag));
      }
    }

    // 2. Filtro por Texto (Busca)
    if (searchTerm) {
      result = result.filter((ex) =>
        ex.exercise_name_lowercase.includes(searchTerm.toLowerCase())
      );
    }

    return result;
  }, [allExercises, searchTerm, selectedTag]);

  const allExerciseNames = useMemo(() => {
    return allExercises.map((ex) => ex.exercise_name_capitalized);
  }, [allExercises]);

  return {
    loading,
    allExercises, 
    filteredExercises,
    allExerciseNames, 
    loadCatalog,
    handleCreateExercise,
    handleRenameExercise,
    handleMergeExercises,
    handleDeleteExercise,
    searchTerm,
    setSearchTerm,
    availableTags,
    selectedTag,
    setSelectedTag
  };
};