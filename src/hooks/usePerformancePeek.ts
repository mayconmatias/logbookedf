import { useState, useRef, useCallback, useEffect } from 'react';
import { PerformancePeekData } from '@/types/workout';
import { ExerciseStats } from '@/types/analytics';
import { fetchPerformancePeek } from '@/services/exercises.service';
import { fetchExerciseStats } from '@/services/stats.service';

export const usePerformancePeek = () => {
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Dados de histórico (última sessão, melhor série para exibição)
  const [performanceData, setPerformanceData] = useState<PerformancePeekData | null>(null);
  
  // Dados estatísticos (para cálculo de PR)
  const [exerciseStats, setExerciseStats] = useState<ExerciseStats | null>(null);
  
  const cachePeek = useRef<Map<string, PerformancePeekData>>(new Map());
  const cacheStats = useRef<Map<string, ExerciseStats>>(new Map());
  
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const clearPeek = useCallback(() => {
    setPerformanceData(null);
    setExerciseStats(null);
  }, []);

  const fetchQuickStats = useCallback(async (definitionId: string | null) => {
    if (!definitionId) {
      clearPeek();
      return;
    }

    // Se já tiver em cache, usa
    if (cachePeek.current.has(definitionId) && cacheStats.current.has(definitionId)) {
      setPerformanceData(cachePeek.current.get(definitionId)!);
      setExerciseStats(cacheStats.current.get(definitionId)!);
      return;
    }

    setLoadingStats(true);
    try {
      // Busca em paralelo: Histórico visual + Estatísticas matemáticas
      const [peekData, statsData] = await Promise.all([
        fetchPerformancePeek(definitionId),
        fetchExerciseStats(definitionId)
      ]);

      if (isMounted.current) {
        if (peekData) {
          setPerformanceData(peekData);
          cachePeek.current.set(definitionId, peekData);
        }
        if (statsData) {
          setExerciseStats(statsData);
          cacheStats.current.set(definitionId, statsData);
        } else {
          // Se não tiver stats (exercício novo), reseta
          setExerciseStats(null);
        }
      }
    } catch (e) {
      console.error("Erro ao buscar stats:", e);
    } finally {
      if (isMounted.current) setLoadingStats(false);
    }
  }, [clearPeek]);

  const invalidateCache = useCallback((definitionId: string) => {
    cachePeek.current.delete(definitionId);
    cacheStats.current.delete(definitionId);
    fetchQuickStats(definitionId);
  }, [fetchQuickStats]);

  return {
    loadingStats,
    performanceData, 
    exerciseStats, // [CORREÇÃO] Agora o hook retorna isso
    fetchQuickStats,
    invalidateCache,
    clearPeek
  };
};