import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Session } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';

import { TimerProvider } from '@/context/TimerContext';
import RestTimer from '@/components/RestTimer';
import * as Notifications from 'expo-notifications';
import BiometricGate from '@/components/BiometricGate';

import { useFonts } from 'expo-font';
import { Feather } from '@expo/vector-icons'; 

import { supabase } from "@/lib/supabaseClient";
import type { RootStackParamList } from "@/types/navigation";

import { navigationRef } from "@/utils/navigationRef";

import LoginCPF from "@/screens/LoginCPF";
import Signup from "@/screens/Signup"; 
import ForgotPassword from "@/screens/ForgotPassword";
import ResetPassword from "@/screens/ResetPassword";

import Home from "@/screens/Home";
import LogWorkout from "@/screens/LogWorkout";
import WorkoutHistory from "@/screens/WorkoutHistory";
import ProfileScreen from '@/screens/ProfileScreen';
import ExerciseCatalogScreen from '@/screens/ExerciseCatalogScreen';
import MyPrograms from '@/screens/MyPrograms';
import MarketplaceScreen from '@/screens/MarketplaceScreen';

import CoachStudentsList from '@/screens/coach/CoachStudentsList';
import CoachStudentDetails from '@/screens/coach/CoachStudentDetails';
import CoachProgramDetails from '@/screens/coach/CoachProgramDetails';
import CoachWorkoutEditor from '@/screens/coach/CoachWorkoutEditor';
import CoachPaywallScreen from '@/screens/CoachPaywallScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['logbookedf://', Linking.createURL('/')],
  config: {
    screens: {
      ResetPassword: 'reset-password',
    },
  },
};

// Safe Mode Notifications
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
} catch (e) {}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const [fontsLoaded] = useFonts({
    ...Feather.font, 
  });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch (e) {
        console.log("Notification permissions skipped (Expo Go)");
      }
    })();
  }, []);

  // [CORREÇÃO] Tratamento robusto de sessão
  useEffect(() => {
    let mounted = true;

    const initializeSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (mounted) {
          setSession(data.session);
        }
      } catch (e: any) {
        console.log("Sessão inválida ou expirada:", e.message);
        await supabase.auth.signOut();
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeSession();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        // Se o evento for SIGNED_OUT, a sessão já vem nula, então isso cobre revogação
        setSession(session);
        
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } else if (event === 'SIGNED_OUT') {
          setIsPasswordRecovery(false);
        } else if (event === 'SIGNED_IN') {
           setIsPasswordRecovery(false);
        }
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <TimerProvider>
          <BiometricGate sessionActive={!!session}>
            <NavigationContainer linking={linking} ref={navigationRef}>
              {session ? (
                 isPasswordRecovery ? (
                    <Stack.Navigator>
                      <Stack.Screen name="ResetPassword" component={ResetPassword} options={{ title: 'Redefinir Senha' }} />
                    </Stack.Navigator>
                 ) : (
                    <Stack.Navigator 
                      screenOptions={{
                        headerBackTitle: 'Voltar', 
                        headerTintColor: '#007AFF' 
                      }}
                    >
                      <Stack.Screen name="Home" component={Home} options={{ title: "Logbook EdF" }} />
                      <Stack.Screen name="LogWorkout" component={LogWorkout} options={{ title: "Registrar Treino", headerBackTitle: "Voltar" }} />
                      <Stack.Screen name="WorkoutHistory" component={WorkoutHistory} options={{ title: "Histórico" }} />
                      <Stack.Screen name="ExerciseCatalog" component={ExerciseCatalogScreen} options={{ title: 'Meus Exercícios' }} />
                      <Stack.Screen name="MyPrograms" component={MyPrograms} options={{ title: 'Meus Programas' }} />
                      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Meu Perfil' }} />
                      <Stack.Screen name="Marketplace" component={MarketplaceScreen} options={{ title: 'Loja de Programas' }} />
                      
                      <Stack.Screen name="CoachPaywall" component={CoachPaywallScreen} options={{ title: 'Seja PRO', presentation: 'modal' }} />
                      <Stack.Screen name="CoachStudentsList" component={CoachStudentsList} options={{ title: 'Área do Treinador' }} />
                      <Stack.Screen name="CoachStudentDetails" component={CoachStudentDetails} options={{ title: 'Detalhes do Aluno' }} />
                      <Stack.Screen name="CoachProgramDetails" component={CoachProgramDetails} options={{ title: 'Dias de Treino' }} />
                      <Stack.Screen name="CoachWorkoutEditor" component={CoachWorkoutEditor} options={{ title: 'Editar Treino' }} />
                    </Stack.Navigator>
                 )
              ) : (
                <Stack.Navigator initialRouteName="LoginCPF">
                  <Stack.Screen name="LoginCPF" component={LoginCPF} options={{ title: "Login" }} />
                  <Stack.Screen name="Signup" component={Signup} options={{ title: "Criar conta" }} />
                  <Stack.Screen name="ForgotPassword" component={ForgotPassword} options={{ title: "Recuperar Senha" }} />
                </Stack.Navigator>
              )}
            </NavigationContainer>
            
            {session && <RestTimer />}
          </BiometricGate>
          
        </TimerProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}