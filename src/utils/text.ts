/**
 * Remove acentos, caracteres especiais e normaliza para minúsculas.
 * Ex: "Supino Inclinado" -> "supino inclinado"
 * Ex: "Elevação Pélvica" -> "elevacao pelvica"
 */
export const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};