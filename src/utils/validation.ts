/**
 * Valida um número de CPF.
 * @param cpf O CPF como string (pode conter pontos ou hifens).
 * @returns true se o CPF for válido, false caso contrário.
 */
export const validateCPF = (cpf: string): boolean => {
  // 1. Remove toda formatação (pontos, hifens)
  const cpfClean = cpf.replace(/[^\d]/g, '');

  // 2. Verifica se tem 11 dígitos
  if (cpfClean.length !== 11) {
    return false;
  }

  // 3. Verifica se todos os dígitos são iguais (ex: 111.111.111-11)
  // Isso é um caso inválido conhecido.
  if (/^(\d)\1+$/.test(cpfClean)) {
    return false;
  }

  let sum: number;
  let remainder: number;

  // --- 4. Validação do Primeiro Dígito Verificador ---
  sum = 0;
  for (let i = 1; i <= 9; i++) {
    sum = sum + parseInt(cpfClean.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }

  if (remainder !== parseInt(cpfClean.substring(9, 10))) {
    return false;
  }

  // --- 5. Validação do Segundo Dígito Verificador ---
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum = sum + parseInt(cpfClean.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }

  if (remainder !== parseInt(cpfClean.substring(10, 11))) {
    return false;
  }

  // 6. Se passou em tudo, é válido
  return true;
};