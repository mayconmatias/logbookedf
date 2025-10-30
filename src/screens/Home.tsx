// src/screens/Home.tsx

import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { supabase } from "@/lib/supabase";

type HomeProps = NativeStackScreenProps<RootStackParamList, "Home">;

export default function Home({ navigation }: HomeProps) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    })();
  }, []);

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Erro", error.message);
  };

  const handleHistoryPress = () => {
    navigation.navigate("WorkoutHistory");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.welcomeText}>Bem-vindo</Text>
      <Text style={styles.emailText}>{email ?? "(sem e-mail)"}</Text>
      
      {/* Botão 1: Registrar Treino de Hoje (Vai para LogWorkout) */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.buttonPrimary}
          // MUDANÇA AQUI: Passa {} para indicar "Modo Criação"
          onPress={() => navigation.navigate("LogWorkout", {})} 
        >
          <Text style={styles.buttonTextPrimary}>Registrar Treino de Hoje</Text>
        </TouchableOpacity>
      </View>
      
      {/* Botão 2: Histórico de Treinos (Vai para WorkoutHistory) */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.buttonSecondary}
          onPress={handleHistoryPress}
        >
          <Text style={styles.buttonTextSecondary}>Histórico de Treinos</Text>
        </TouchableOpacity>
      </View>
      
      {/* Botão de Sair */}
      <View style={styles.logoutButton}>
        <TouchableOpacity 
          style={styles.buttonDanger}
          onPress={logout}
        >
           <Text style={styles.buttonTextDanger}>Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// (Estilos permanecem os mesmos)
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#fff', },
  welcomeText: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, },
  emailText: { fontSize: 16, color: '#333', marginBottom: 40, },
  buttonContainer: { width: '90%', marginVertical: 8, },
  logoutButton: { width: '90%', marginTop: 20, },
  buttonPrimary: { backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 10, alignItems: 'center', },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '600', },
  buttonSecondary: { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF', },
  buttonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600', },
  buttonDanger: { backgroundColor: '#FF3B30', paddingVertical: 14, borderRadius: 10, alignItems: 'center', },
  buttonTextDanger: { color: '#fff', fontSize: 16, fontWeight: '600', }
});