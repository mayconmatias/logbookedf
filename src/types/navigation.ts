// src/types/navigation.ts
import { CoachingRelationship, Program, PlannedWorkout } from './coaching';

export type RootStackParamList = {
  Home: undefined;
  LoginCPF: undefined;
  Signup: undefined;
  
  // [NOVO] Telas de Senha
  ForgotPassword: undefined;
  ResetPassword: undefined;
  
  LogWorkout: { workoutId?: string; templateId?: string };
  WorkoutHistory: { highlightWorkoutId?: string };
  Profile: undefined;
  ExerciseCatalog: undefined;
  MyPrograms: undefined;
  Marketplace: undefined;
  CoachStudentsList: undefined;
  CoachStudentDetails: { relationship: CoachingRelationship };
  CoachProgramDetails: { program: Program };
  CoachWorkoutEditor: { workout: PlannedWorkout };
  CoachPaywall: undefined;
};