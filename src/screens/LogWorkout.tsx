// src/screens/LogWorkout.tsx

import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Alert, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView as RNScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { supabase } from "@/lib/supabase";
import { Feather } from '@expo/vector-icons'; 

// (Tipos de dados)
type SetData = { id: string; set_number: number; weight: number; reps: number; rpe?: number; observations?: string; performed_at: string; };
type ExerciseData = { id: string; name: string; sets: SetData[]; };
type GroupedWorkout = ExerciseData[];

// MUDANÇA AQUI: O tipo das props agora lê os 'route.params'
export default function LogWorkout({ navigation, route }: NativeStackScreenProps<RootStackParamList, "LogWorkout">) {
  // Lê o workoutId opcional dos parâmetros da rota
  const { workoutId: paramWorkoutId } = route.params || {};

  // MUDANÇA AQUI: Renomeado para 'sessionWorkoutId'
  const [sessionWorkoutId, setSessionWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exerciseName, setExerciseName] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState("");
  const [observations, setObservations] = useState("");
  const [groupedWorkout, setGroupedWorkout] = useState<GroupedWorkout>([]);
  
  const scrollViewRef = useRef<RNScrollView>(null);

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  // MUDANÇA AQUI: Lógica de inicialização com dois modos
  useEffect(() => {
    const initializeSession = async () => {
      setLoading(true);
      try {
        if (paramWorkoutId) {
          // === MODO EDIÇÃO ===
          // Se um workoutId foi passado, estamos editando.
          console.log("Modo Edição: Carregando treino ID:", paramWorkoutId);
          navigation.setOptions({ title: "Editar Treino" }); // Atualiza o título da tela
          await fetchAndGroupWorkoutData(paramWorkoutId);
          setSessionWorkoutId(paramWorkoutId); // Define o ID da sessão
        } else {
          // === MODO CRIAÇÃO ===
          // Se nenhum workoutId foi passado, criamos um novo.
          console.log("Modo Criação: Criando novo treino.");
          navigation.setOptions({ title: "Registrar Treino" }); // Título padrão
          await createNewWorkoutSession();
        }
      } catch (e: any) {
        Alert.alert("Erro ao carregar sessão", e.message);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, [paramWorkoutId, navigation]); // Roda quando a tela abre

  // MUDANÇA AQUI: Esta função agora é chamada pelo "Modo Criação"
  const createNewWorkoutSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não encontrado");
    const today = getTodayDateString();
    
    const { data: newWorkout, error: createError } = await supabase
      .from("workouts")
      .insert({ user_id: user.id, workout_date: today })
      .select("id")
      .single();
      
    if (createError) throw createError;
    
    setSessionWorkoutId(newWorkout.id); // Define o ID da sessão
    setGroupedWorkout([]); // Começa vazio
  };

  // MUDANÇA AQUI: Esta função (que tínhamos removido) está de volta
  // É chamada pelo "Modo Edição"
  const fetchAndGroupWorkoutData = async (currentWorkoutId: string) => {
    const { data: exercises, error } = await supabase
      .from("exercises")
      .select(`
        id,
        name,
        sets ( id, set_number, weight, reps, rpe, observations, performed_at )
      `)
      .eq("workout_id", currentWorkoutId)
      .order("created_at", { ascending: true })
      .order("performed_at", { referencedTable: "sets", ascending: true });

    if (error) throw error;
    setGroupedWorkout(exercises as GroupedWorkout);
  };

  // === LÓGICA PARA SALVAR UMA SÉRIE (Atualizada) ===
  const handleSaveSet = async () => {
    // MUDANÇA AQUI: Usa o 'sessionWorkoutId' do estado
    if (!exerciseName || !weight || !reps || !sessionWorkoutId) {
      return Alert.alert("Atenção", "Exercício, Peso e Repetições são obrigatórios.");
    }
    setSaving(true);
    try {
      // MUDANÇA AQUI: Passa o 'sessionWorkoutId'
      const exerciseId = await getOrCreateExerciseId(sessionWorkoutId, exerciseName);
      // (O resto da lógica é a mesma)
      const existingExercise = groupedWorkout.find(ex => ex.id === exerciseId);
      const nextSetNumber = (existingExercise ? existingExercise.sets.length : 0) + 1;
      const newSetData = { exercise_id: exerciseId, set_number: nextSetNumber, weight: parseFloat(weight), reps: parseInt(reps, 10), rpe: rpe ? parseFloat(rpe) : undefined, observations: observations || undefined, };
      const { data: createdSet, error: setError } = await supabase.from("sets").insert(newSetData).select().single();
      if (setError) throw setError;
      updateLocalStateWithNewSet(exerciseId, exerciseName, createdSet as SetData);
      setWeight("");
      setReps("");
      setRpe("");
      setObservations("");
    } catch (e: any) {
      Alert.alert("Erro ao salvar série", e.message);
    } finally {
      setSaving(false);
    }
  };

  // (O restante do arquivo: getOrCreateExerciseId, updateLocalState, funções de deletar, renderização e estilos... permanecem os mesmos)
  // ... (todas as outras funções que já escrevemos, como handleDeleteSet, handleDeleteExercise, etc., continuam aqui) ...
  // (getOrCreateExerciseId e updateLocalStateWithNewSet permanecem os mesmos)
  const getOrCreateExerciseId = async (currentWorkoutId: string, name: string): Promise<string> => {
    const localMatch = groupedWorkout.find(ex => ex.name.toLowerCase() === name.toLowerCase());
    if (localMatch) return localMatch.id;
    const { data: dbMatch, error: findError } = await supabase.from("exercises").select("id").eq("workout_id", currentWorkoutId).eq("name", name).maybeSingle();
    if (findError) throw findError;
    if (dbMatch) return dbMatch.id;
    const { data: newExercise, error: createError } = await supabase.from("exercises").insert({ workout_id: currentWorkoutId, name: name }).select("id").single();
    if (createError) throw createError;
    return newExercise.id;
  };

  const updateLocalStateWithNewSet = (exerciseId: string, name: string, newSet: SetData) => {
    setGroupedWorkout(currentData => {
      const exerciseExists = currentData.some(ex => ex.id === exerciseId);
      if (exerciseExists) {
        return currentData.map(ex => ex.id === exerciseId ? { ...ex, sets: [...ex.sets, newSet] } : ex);
      } else {
        const newExercise: ExerciseData = { id: exerciseId, name: name, sets: [newSet] };
        return [...currentData, newExercise];
      }
    });
  };
  
  // (Funções de deletar série)
  const handleDeleteSet = (setId: string, exerciseId: string) => {
    Alert.alert( "Deletar Série", "Tem certeza que deseja deletar esta série?",
      [ { text: "Cancelar", style: "cancel" },
        { text: "Deletar", style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase.from("sets").delete().eq("id", setId);
              if (error) throw error;
              updateLocalStateAfterSetDelete(setId, exerciseId);
            } catch (e: any) { Alert.alert("Erro ao deletar", e.message); }
          } 
        }
      ]
    );
  };
  const updateLocalStateAfterSetDelete = (setId: string, exerciseId: string) => {
    setGroupedWorkout(currentData => {
      return currentData
        .map(exercise => {
          if (exercise.id === exerciseId) {
            const updatedSets = exercise.sets.filter(set => set.id !== setId);
            const renumberedSets = updatedSets.map((set, index) => ({ ...set, set_number: index + 1 }));
            return { ...exercise, sets: renumberedSets };
          }
          return exercise;
        })
        .filter(exercise => exercise.sets.length > 0);
    });
  };
  
  // (Funções de deletar exercício)
  const handleDeleteExercise = (exerciseId: string, exerciseName: string) => {
    Alert.alert( "Deletar Exercício", `Tem certeza que deseja deletar "${exerciseName}" e todas as suas séries?`,
      [ { text: "Cancelar", style: "cancel" },
        { text: "Deletar", style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase.from("exercises").delete().eq("id", exerciseId);
              if (error) throw error;
              updateLocalStateAfterExerciseDelete(exerciseId);
            } catch (e: any) { Alert.alert("Erro ao deletar exercício", e.message); }
          } 
        }
      ]
    );
  };
  const updateLocalStateAfterExerciseDelete = (exerciseId: string) => {
    setGroupedWorkout(currentData => {
      return currentData.filter(exercise => exercise.id !== exerciseId);
    });
  };

  // (Função do menu de opções)
  const handleOpenExerciseMenu = (exercise: ExerciseData) => {
    Alert.alert(
      `Opções para "${exercise.name}"`,
      "O que você gostaria de fazer?",
      [
        {
          text: "Editar Nome (usar como template)",
          onPress: () => {
            setExerciseName(exercise.name);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }
        },
        {
          text: "Deletar Exercício",
          style: "destructive",
          onPress: () => handleDeleteExercise(exercise.id, exercise.name)
        },
        {
          text: "Cancelar",
          style: "cancel"
        }
      ]
    );
  };

  // === RENDERIZAÇÃO ===
  
  if (loading) {
    return <View style={styles.container}><ActivityIndicator /></View>;
  }

  return (
    <ScrollView style={styles.container} ref={scrollViewRef}>
      {/* Formulário (sem mudança) */}
      <View style={styles.form}>
        <Text style={styles.label}>Exercício</Text>
        <TextInput style={styles.input} placeholder="Ex.: Agachamento" value={exerciseName} onChangeText={setExerciseName} />
        <Text style={styles.label}>Peso (kg)</Text>
        <TextInput style={styles.input} placeholder="Ex.: 100" keyboardType="numeric" value={weight} onChangeText={setWeight} />
        <Text style={styles.label}>Repetições</Text>
        <TextInput style={styles.input} placeholder="Ex.: 5" keyboardType="number-pad" value={reps} onChangeText={setReps} />
        <Text style={styles.label}>RPE (opcional)</Text>
        <TextInput style={styles.input} placeholder="Ex.: 7.5" keyboardType="numeric" value={rpe} onChangeText={setRpe} />
        <Text style={styles.label}>Observações (opcional)</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Técnica, dor, cadência..." multiline value={observations} onChangeText={setObservations} />
        <TouchableOpacity style={[styles.buttonPrimary, saving ? styles.buttonDisabled : {}]} onPress={handleSaveSet} disabled={saving}>
          <Text style={styles.buttonTextPrimary}>{saving ? "Salvando..." : "Salvar série"}</Text>
        </TouchableOpacity>
      </View>

      {/* Log de Treino */}
      <View style={styles.logContainer}>
        {/* MUDANÇA AQUI: Título dinâmico */}
        <Text style={styles.logTitle}>{paramWorkoutId ? "Editando Treino" : "Nova Sessão"} ({getTodayDateString()})</Text>

        {groupedWorkout.length === 0 && (
          <Text style={styles.emptyText}>Nenhuma série registrada ainda.</Text>
        )}
        
        {groupedWorkout.map((exercise) => (
          <View key={exercise.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              <TouchableOpacity 
                style={styles.deleteExerciseButton}
                onPress={() => handleOpenExerciseMenu(exercise)}
              >
                <Feather name="more-vertical" size={20} color="#555" />
              </TouchableOpacity>
            </View>
            
            {exercise.sets.map((set) => (
              <View key={set.id} style={styles.setRow}>
                <View style={styles.setRowContent}>
                  <View style={styles.setTextContainer}>
                    <Text style={styles.setText}>
                      <Text style={{fontWeight: 'bold'}}>Série {set.set_number}:</Text> {set.weight}kg x {set.reps} reps {set.rpe ? `@ RPE ${set.rpe}` : ''}
                    </Text>
                    {set.observations && (<Text style={styles.obsText}>↳ {set.observations}</Text>)}
                    <Text style={styles.timeText}>{new Date(set.performed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.deleteSetButton}
                    onPress={() => handleDeleteSet(set.id, exercise.id)}
                  >
                    <Feather name="trash-2" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Rodapé */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.buttonSecondary} onPress={() => navigation.navigate("Home")}>
          {/* MUDANÇA AQUI: Título do botão */}
          <Text style={styles.buttonTextSecondary}>{paramWorkoutId ? "Salvar Edições" : "Finalizar Treino"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// (Estilos permanecem os mesmos)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', },
  form: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 8, },
  label: { fontSize: 16, fontWeight: '600', color: '#333', },
  input: { borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 12, paddingVertical: 14, borderRadius: 10, fontSize: 16, marginBottom: 8, },
  multiline: { height: 80, textAlignVertical: 'top', },
  logContainer: { padding: 20, },
  logTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, },
  emptyText: { fontSize: 16, color: '#777', textAlign: 'center', },
  exerciseCard: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 16, marginBottom: 16, },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8, marginBottom: 12, },
  exerciseName: { fontSize: 18, fontWeight: 'bold', flex: 1, },
  deleteExerciseButton: { padding: 8, marginLeft: 10, },
  setRow: { marginBottom: 10, },
  setRowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', },
  setTextContainer: { flex: 1, marginRight: 10, },
  setText: { fontSize: 16, color: '#333', },
  obsText: { fontSize: 14, color: '#555', fontStyle: 'italic', marginLeft: 10, marginTop: 2, },
  timeText: { fontSize: 12, color: '#888', marginTop: 2, },
  deleteSetButton: { padding: 8, },
  footer: { padding: 20, paddingTop: 0, marginTop: 10, marginBottom: 20, },
  buttonPrimary: { backgroundColor: '#007AFF', paddingVertical: 14, borderRadius: 10, alignItems: 'center', },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '600', },
  buttonSecondary: { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF', },
  buttonTextSecondary: { color: '#007AFF', fontSize: 16, fontWeight: '600', },
  buttonDisabled: { backgroundColor: '#A9A9A9', }
});