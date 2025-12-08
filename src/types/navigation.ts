// src/types/navigation.ts
import { CoachingRelationship, Program, PlannedWorkout } from './coaching';

export type RootStackParamList = {
  Home: undefined;
  LoginCPF: undefined;
  Signup: undefined;
  
  ForgotPassword: undefined;
  ResetPassword: undefined;
  
  LogWorkout: { workoutId?: string; templateId?: string };
  WorkoutHistory: { highlightWorkoutId?: string } | undefined;
  Profile: undefined;
  ExerciseCatalog: undefined;
  MyPrograms: undefined;
  Marketplace: undefined;

  Dashboard: undefined
  
  CoachStudentsList: undefined;
  CoachStudentDetails: { relationship: CoachingRelationship };
  
  // [NOVO] Tela dedicada de gestão de programas do aluno
  CoachStudentPrograms: { studentId: string; studentName: string };
  
  CoachProgramDetails: { program: Program };
  CoachWorkoutEditor: { workout: PlannedWorkout };
  CoachPaywall: undefined;
};