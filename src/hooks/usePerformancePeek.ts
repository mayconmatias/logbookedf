// src/hooks/usePerformancePeek.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { ExerciseStats } from '@/types/analytics';
import { fetchExerciseStats } from '@/services/stats.service'; // Novo serviço

export const usePerformancePeek = () => {
  const [loadingStats, setLoadingStats] = useState(false);
  const [exerciseStats, setExerciseStats] = useState<ExerciseStats | null>(null);
  
  // Cache simples em memória para não buscar a mesma coisa mil vezes na mesma sessão
  const cache = useRef<Map<string, ExerciseStats>>(new Map());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const clearPeek = useCallback(() => {
    setExerciseStats(null);
  }, []);

  const fetchQuickStats = useCallback(async (definitionId: string | null) => {
    if (!definitionId) {
      clearPeek();
      return;
    }

    if (cache.current.has(definitionId)) {
      setExerciseStats(cache.current.get(definitionId)!);
      return;
    }

    setLoadingStats(true);
    try {
      const stats = await fetchExerciseStats(definitionId);
      if (isMounted.current && stats) {
        setExerciseStats(stats);
        cache.current.set(definitionId, stats);
      } else if (isMounted.current) {
        setExerciseStats(null); // Nenhum histórico ainda
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isMounted.current) setLoadingStats(false);
    }
  }, [clearPeek]);

  // [IMPORTANTE] Função para forçar atualização (ex: após salvar um PR)
  const invalidateCache = useCallback((definitionId: string) => {
    cache.current.delete(definitionId);
    fetchQuickStats(definitionId);
  }, [fetchQuickStats]);

  return {
    loadingStats,
    exerciseStats, // Objeto limpo com max_e1rm, max_weight, etc.
    fetchQuickStats,
    invalidateCache,
    clearPeek
  };
};