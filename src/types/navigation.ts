// src/types/navigation.ts
import { CoachingRelationship, Program, PlannedWorkout } from './coaching';

export type RootStackParamList = {
  // Telas Principais
  Home: undefined;
  LoginCPF: undefined;
  Signup: undefined;
  
  // Recuperação de Senha
  ForgotPassword: undefined;
  ResetPassword: undefined;
  
  // Fluxo de Treino do Aluno
  LogWorkout: { workoutId?: string; templateId?: string };
  WorkoutHistory: { highlightWorkoutId?: string } | undefined;
  
  // Menu/Configurações
  Profile: undefined;
  ExerciseCatalog: undefined;
  MyPrograms: undefined;
  Marketplace: undefined;

  // Analytics
  Dashboard: undefined;

  //notificações
  Notifications: undefined;
  
  // --- ÁREA DO TREINADOR ---
  CoachStudentsList: undefined;
  CoachStudentDetails: { relationship: CoachingRelationship };
  
  // Gestão de Programas do Aluno
  CoachStudentPrograms: { studentId: string; studentName: string };
  
  // Detalhes do Programa (Lista de dias de treino)
  CoachProgramDetails: { program: Program };
  
  // Editor de Treino (Lista de exercícios)
  // [ATUALIZADO] studentId adicionado para permitir o chat de feedback
  CoachWorkoutEditor: { workout: PlannedWorkout; studentId?: string };
  
  // Vendas/Planos
  CoachPaywall: undefined;


  ExerciseFeedback: { 
  definitionId: string; 
  exerciseName: string; 
  userId: string | null;
};
};