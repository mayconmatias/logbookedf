/**
 * Regex para validar se uma string é um UUID.
 * Usado para diferenciar IDs reais do Supabase de IDs temporários (ex: templates).
 */
export const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Função helper para testar o regex.
 */
export const isUUID = (id: string): boolean => {
  return UUID_REGEX.test(id);
};