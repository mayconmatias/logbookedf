import { WorkoutHistoryItem, WorkoutExercise } from '@/types/workout';

/**
 * Gera uma string formatada em Markdown para um treino histórico completo.
 */
export const generateWorkoutMarkdown = (workout: WorkoutHistoryItem): string => {
  const dateFormatted = new Date(workout.workout_date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  // Título
  let md = `*Treino - ${dateFormatted}*\n`;
  if (workout.template_name && workout.template_name !== 'Treino Livre') {
    md += `_${workout.template_name}_\n`;
  }
  md += `\n`;

  // Exercícios
  workout.performed_data.forEach((ex: WorkoutExercise) => {
    md += `*${ex.name}*\n`;

    // Agrupamento visual simples
    ex.sets.forEach((set) => {
      const weight = set.weight;
      const reps = set.reps;
      
      // Detalhes opcionais
      let extras = [];
      if (set.rpe) extras.push(`@${set.rpe}`);
      if (set.side) extras.push(`(${set.side})`);
      
      const extrasStr = extras.length > 0 ? ` ${extras.join(' ')}` : '';

      // Formato: - 100kg x 5 reps @8
      md += `- ${weight}kg x ${reps}${extrasStr}\n`;
    });
    md += `\n`;
  });

  md += `_Gerado pelo Logbook Escola de Força_`;
  return md;
};