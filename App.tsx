import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Session } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './src/i18n/index.ts';

import { TimerProvider } from '@/context/TimerContext';
import { TutorialProvider } from '@/context/TutorialContext';
import RestTimer from '@/components/RestTimer';
import * as Notifications from 'expo-notifications';
import BiometricGate from '@/components/BiometricGate';

import { useFonts } from 'expo-font';
import { Feather } from '@expo/vector-icons'; 

import { supabase } from "@/lib/supabaseClient";
import type { RootStackParamList } from "@/types/navigation";

import { navigationRef } from "@/utils/navigationRef";

import { Toaster } from 'sonner-native';

import DashboardScreen from "@/screens/DashboardScreen";

// Telas de Autenticação
import LoginScreen from "@/screens/LoginScreen";
import Signup from "@/screens/Signup"; 
import ForgotPassword from "@/screens/ForgotPassword";
import ResetPassword from "@/screens/ResetPassword";

// Telas Principais (Aluno)
import Home from "@/screens/Home";
import LogWorkout from "@/screens/LogWorkout";
import WorkoutHistory from "@/screens/WorkoutHistory";
import ProfileScreen from '@/screens/ProfileScreen';
import ExerciseCatalogScreen from '@/screens/ExerciseCatalogScreen';
import MyPrograms from '@/screens/MyPrograms';
import MarketplaceScreen from '@/screens/MarketplaceScreen';
import ProductDetailsScreen from '@/screens/ProductDetailsScreen'; 
import NotificationsScreen from '@/screens/NotificationsScreen';

// Wrapper do Modal
import ExerciseFeedbackScreen from '@/screens/ExerciseFeedbackScreen'; 

// Telas do Treinador
import CoachStudentsList from '@/screens/coach/CoachStudentsList';
import CoachStudentDetails from '@/screens/coach/CoachStudentDetails';
import CoachStudentPrograms from '@/screens/coach/CoachStudentPrograms';
import CoachProgramDetails from '@/screens/coach/CoachProgramDetails';
import CoachWorkoutEditor from '@/screens/coach/CoachWorkoutEditor';
import CoachPaywallScreen from '@/screens/CoachPaywallScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['logbookedf://', Linking.createURL('/')],
  config: {
    screens: {
      Login: 'login',
      Signup: 'signup',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
      Home: 'home',
    },
  },
};

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
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

  const extractParamsFromUrl = (url: string) => {
    const params: { [key: string]: string } = {};
    const regex = /[#?&]([^=#]+)=([^&#]*)/g;
    let match;
    while ((match = regex.exec(url))) {
      params[match[1]] = decodeURIComponent(match[2]);
    }
    return params;
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') await Notifications.requestPermissionsAsync();
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    let mounted = true;

    const handleDeepLink = async (url: string | null) => {
      if (!url) return;

      if (url.includes('reset-password')) {
        setIsPasswordRecovery(true);

        const params = extractParamsFromUrl(url);
        if (params.access_token && params.refresh_token) {
          try {
            const { error } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            if (error) console.log("Erro setSession link:", error.message);
          } catch (err) {
            console.log("Erro auth setSession:", err);
          }
        }
      }
    };

    const initialize = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        await handleDeepLink(initialUrl);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (mounted) setSession(data.session);
      } catch (e) {
        console.log("Init error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        setSession(session);
        
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } 
        else if (event === 'SIGNED_OUT') {
          setIsPasswordRecovery(false);
        }
        // [CORREÇÃO] Ao atualizar o usuário (trocar senha), saímos do modo de recuperação
        else if (event === 'USER_UPDATED') {
          setIsPasswordRecovery(false);
        }
      }
    );

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      linkingSub.remove();
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
          <TimerProvider>
            <TutorialProvider>
              <BiometricGate sessionActive={!!session && !isPasswordRecovery}>
                <NavigationContainer linking={linking} ref={navigationRef}>
                {session ? (
                   isPasswordRecovery ? (
                      <Stack.Navigator>
                        <Stack.Screen 
                          name="ResetPassword" 
                          component={ResetPassword} 
                          options={{ 
                            title: 'Criar Nova Senha',
                            headerLeft: () => null 
                          }} 
                          // Se sair da tela (ex: sucesso), garante reset do estado
                          listeners={{
                            blur: () => setIsPasswordRecovery(false)
                          }}
                        />
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
                        <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} options={{ title: 'Detalhes' }} />
                        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notificações' }} />
                        
                        <Stack.Screen 
                          name="ExerciseFeedback" 
                          component={ExerciseFeedbackScreen} 
                          options={{ 
                            presentation: 'transparentModal',
                            headerShown: false,
                            animation: 'fade',
                            contentStyle: { backgroundColor: 'transparent' }
                          }} 
                        />
                        
                        <Stack.Screen name="CoachPaywall" component={CoachPaywallScreen} options={{ title: 'Seja PRO', presentation: 'modal' }} />
                        <Stack.Screen name="CoachStudentsList" component={CoachStudentsList} options={{ title: 'Área do Treinador' }} />
                        <Stack.Screen name="CoachStudentDetails" component={CoachStudentDetails} options={{ title: 'Detalhes do Aluno' }} />
                        
                        <Stack.Screen name="Dashboard" component={DashboardScreen} />

                        <Stack.Screen name="CoachStudentPrograms" component={CoachStudentPrograms} options={{ title: 'Programas do Aluno' }} />
                        <Stack.Screen name="CoachProgramDetails" component={CoachProgramDetails} options={{ title: 'Dias de Treino' }} />
                        <Stack.Screen name="CoachWorkoutEditor" component={CoachWorkoutEditor} options={{ title: 'Editar Treino' }} />
                      </Stack.Navigator>
                   )
                ) : (
                  <Stack.Navigator initialRouteName="Login">
                    <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Login" }} />
                    <Stack.Screen name="Signup" component={Signup} options={{ title: "Criar conta" }} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPassword} options={{ title: "Recuperar Senha" }} />
                  </Stack.Navigator>
                )}
              </NavigationContainer>
              
              {session && !isPasswordRecovery && <RestTimer />}
              <Toaster />
            </BiometricGate>
            </TutorialProvider>
          </TimerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}