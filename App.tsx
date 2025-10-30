// App.tsx

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Session } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

// Importe o cliente centralizado
import { supabase } from "@/lib/supabase";

// Importe as NOVAS telas
import LoginCPF from "@/screens/LoginCPF";
import Signup from "@/screens/Signup"; // Nova tela
import Home from "@/screens/Home";
import LogWorkout from "@/screens/LogWorkout";
import WorkoutHistory from "@/screens/WorkoutHistory";

// Atualize o Type
export type RootStackParamList = {
  LoginCPF: undefined;
  Signup: undefined; // Nova tela
  Home: undefined;
  LogWorkout: undefined;
  WorkoutHistory: undefined;
  // Telas antigas removidas
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // O useEffect ficou MUITO mais simples
  useEffect(() => {
    let mounted = true;

    // Apenas pega a sessão
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setLoading(false);
    })();

    // Ouve mudanças (Login, Logout, Confirmação de E-mail)
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Tela de Loading
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Lógica de Renderização (muito mais limpa)
  return (
    <NavigationContainer>
      {session ? (
        // 1. LOGADO: Mostra o App principal
        <Stack.Navigator>
          <Stack.Screen name="Home" component={Home} options={{ title: "Bem-vindo" }} />
          {/* É AQUI que você vai adicionar as telas do Logbook */}
          <Stack.Screen name="LogWorkout" component={LogWorkout} options={{ title: "Registrar Treino" }} />
          <Stack.Screen name="WorkoutHistory" component={WorkoutHistory} options={{ title: "Histórico" }} />
        </Stack.Navigator>
      ) : (
        // 2. NÃO LOGADO: Mostra telas de Auth
        <Stack.Navigator initialRouteName="LoginCPF">
          <Stack.Screen name="LoginCPF" component={LoginCPF} options={{ title: "Login" }} />
          <Stack.Screen name="Signup" component={Signup} options={{ title: "Criar conta" }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}