/**
 * Retorna a diferença de dias entre uma data e hoje,
 * padronizado como "há X dias", conforme o plano de refatoração.
 * * @param dateString Uma data ISO string ou objeto Date.
 */
export const getDaysAgo = (dateString: string | Date): string => {
  const today = new Date();
  const pastDate = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  // Zera as horas para comparar apenas os dias
  today.setHours(0, 0, 0, 0);
  pastDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - pastDate.getTime();
  
  // Se a data for no futuro (ou hoje), diffTime <= 0
  if (diffTime < 0) return "hoje";

  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "há 1 dia"; // Singular
  return `há ${diffDays} dias`; // Plural
};

export const getLocalYYYYMMDD = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};