/**
 * Fator de conversão de Libras (lbs) para Quilogramas (kg).
 */
export const LBS_TO_KG_FACTOR = 0.45359237;

/**
 * Calcula a Estimativa de 1 Repetição Máxima (e1RM)
 * Usando a fórmula CUSTOMIZADA (power(1 + (0.032 * r), 0.90)).
 * [CORREÇÃO] A regra 'reps >= 4' foi removida para calcular
 * o e1RM para todas as séries.
 */
export const calculateE1RM = (weight: number, reps: number): number => {
  // 1. Apenas validações básicas
  if (reps <= 0 || weight <= 0) {
    return 0;
  }
  
  // 2. Aplica a fórmula customizada para TODAS as reps > 0
  const e1rm = weight * Math.pow(1 + 0.032 * reps, 0.90);
  
  return Math.round(e1rm * 100) / 100;
};