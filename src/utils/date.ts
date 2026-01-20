/**
 * Retorna a diferença de dias entre uma data e hoje,
 * padronizado como "há X dias".
 */
export const getDaysAgo = (dateString: string | Date): string => {
  const today = new Date();
  const pastDate = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  today.setHours(0, 0, 0, 0);
  pastDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - pastDate.getTime();
  
  if (diffTime < 0) return "hoje";

  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "há 1 dia";
  return `há ${diffDays} dias`;
};

export const getLocalYYYYMMDD = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// [NOVO] Lógica de Validação de Plano
export type PlanStatus = 'active' | 'future' | 'expired';

export const checkPlanValidity = (startsAt?: string | null, expiresAt?: string | null): PlanStatus => {
  const now = new Date();
  // Zera horas para comparação justa de dias
  now.setHours(0,0,0,0);

  // 1. Checa Início
  if (startsAt) {
    const start = new Date(startsAt);
    start.setHours(0,0,0,0);
    if (start > now) return 'future';
  }

  // 2. Checa Fim (Com Tolerância de 24h implícita na lógica de dia)
  if (expiresAt) {
    const end = new Date(expiresAt);
    // Define o fim do dia da expiração (23:59:59)
    end.setHours(23, 59, 59, 999);
    
    const nowFull = new Date(); // Pega hora atual real
    if (nowFull > end) return 'expired';
  }

  return 'active';
};