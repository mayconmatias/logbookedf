import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { VALID_MUSCLES } from '@/constants/muscles';
import { validateExerciseClassification } from '@/services/exercises.service';

interface Props {
  definitionId: string;
  exerciseName: string;
  currentTag: string; // Ex: "Costas"
  onValidationComplete: () => void; // Callback para esconder o card após uso
}

export default function ExerciseValidationCard({ definitionId, exerciseName, currentTag, onValidationComplete }: Props) {
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // O usuário disse SIM, está correto
      await validateExerciseClassification(definitionId, true);
      onValidationComplete();
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCorrection = async (newTag: string) => {
    setPickerVisible(false);
    setLoading(true);
    try {
      // O usuário disse NÃO e escolheu o correto
      await validateExerciseClassification(definitionId, false, newTag);
      Alert.alert("Ajustado!", `Classificado agora como ${newTag}.`);
      onValidationComplete();
    } catch (e) {
      Alert.alert("Erro", "Não foi possível salvar a correção.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="cpu" size={16} color="#805AD5" />
        <Text style={styles.title}>Verificação da IA</Text>
      </View>
      
      <Text style={styles.question}>
        O exercício <Text style={styles.bold}>"{exerciseName}"</Text> é pro grupamento <Text style={styles.boldTag}>{currentTag}</Text>?
      </Text>

      <View style={styles.actions}>
        {/* BOTÃO NÃO */}
        <TouchableOpacity 
          style={[styles.btn, styles.btnNo]} 
          onPress={() => setPickerVisible(true)}
          disabled={loading}
        >
          <Feather name="thumbs-down" size={18} color="#E53E3E" />
          <Text style={styles.btnTextNo}>Não</Text>
        </TouchableOpacity>

        {/* BOTÃO SIM */}
        <TouchableOpacity 
          style={[styles.btn, styles.btnYes]} 
          onPress={handleConfirm}
          disabled={loading}
        >
          <Feather name="thumbs-up" size={18} color="#38A169" />
          <Text style={styles.btnTextYes}>Sim</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de Correção */}
      <Modal visible={isPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Qual o grupo correto?</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Feather name="x" size={24} color="#4A5568" />
              </TouchableOpacity>
            </View>
            
            <FlatList 
              data={VALID_MUSCLES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.muscleItem} onPress={() => handleCorrection(item)}>
                  <Text style={styles.muscleText}>{item}</Text>
                  {item === currentTag && <Text style={styles.currentBadge}>(Atual)</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F3F0FF', // Roxo bem clarinho pra destacar que é IA
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D6BCFA'
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '700', color: '#6B46C1', textTransform: 'uppercase' },
  question: { fontSize: 15, color: '#2D3748', marginBottom: 16, lineHeight: 22 },
  bold: { fontWeight: '700' },
  boldTag: { fontWeight: '800', color: '#553C9A' },
  
  actions: { flexDirection: 'row', gap: 12 },
  btn: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
    paddingVertical: 10, borderRadius: 8, borderWidth: 1, gap: 8 
  },
  btnNo: { backgroundColor: '#FFF', borderColor: '#FC8181' },
  btnYes: { backgroundColor: '#F0FFF4', borderColor: '#68D391' },
  
  btnTextNo: { color: '#C53030', fontWeight: '700' },
  btnTextYes: { color: '#2F855A', fontWeight: '700' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  muscleItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDF2F7', flexDirection: 'row', justifyContent: 'space-between' },
  muscleText: { fontSize: 16, color: '#4A5568' },
  currentBadge: { fontSize: 12, color: '#A0AEC0', fontStyle: 'italic' }
});