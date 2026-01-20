/**
 * Fator de conversão de Libras (lbs) para Quilogramas (kg).
 */
export const LBS_TO_KG_FACTOR = 0.45359237;

/**
 * Calcula a Estimativa de 1 Repetição Máxima (e1RM)
 * Agora considera o RPE (Reserva de Repetições) para projetar a falha.
 * * Fórmula Base: weight * (1 + 0.032 * (reps + RIR))^0.90
 * Onde RIR (Reps in Reserve) = 10 - RPE (apenas se RPE >= 5)
 */
export const calculateE1RM = (weight: number, reps: number, rpe?: number): number => {
  // 1. Validações básicas
  if (reps <= 0 || weight <= 0) {
    return 0;
  }

  // 2. Cálculo do RIR (Reps in Reserve)
  // Se o RPE não for informado ou for muito baixo (< 5), assumimos que não é um parâmetro confiável 
  // para projeção de máxima, então tratamos como RPE 10 (falha) ou ignoramos o bonus.
  let effectiveReps = reps;
  
  if (rpe && rpe >= 5 && rpe <= 10) {
    const rir = 10 - rpe;
    effectiveReps = reps + rir;
  }

  // 3. Aplica a fórmula customizada da Escola de Força
  const e1rm = weight * Math.pow(1 + 0.032 * effectiveReps, 0.90);
  
  return Math.round(e1rm * 100) / 100;
};