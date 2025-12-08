import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { submitDailyCheckin } from '@/services/dashboard.service';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Sub-componente para os botões de escolha (-1, 0, 1)
const MetricSelector = ({ 
  label, 
  value, 
  onChange,
  type = 'default' 
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void;
  type?: 'invert' | 'default'; // Para casos onde 'alto' é ruim (ex: estresse), mas no DALDA adaptado padronizamos: Melhor (+1), Pior (-1)
}) => {
  return (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorLabel}>{label}</Text>
      <View style={styles.optionsRow}>
        
        {/* Opção PIOR (-1) */}
        <TouchableOpacity 
          style={[styles.optionBtn, value === -1 && styles.optionBtnBad]} 
          onPress={() => onChange(-1)}
        >
          <Feather name="thumbs-down" size={18} color={value === -1 ? '#FFF' : '#A0AEC0'} />
          <Text style={[styles.optionText, value === -1 && styles.optionTextActive]}>Pior</Text>
        </TouchableOpacity>

        {/* Opção NORMAL (0) */}
        <TouchableOpacity 
          style={[styles.optionBtn, value === 0 && styles.optionBtnNeutral]} 
          onPress={() => onChange(0)}
        >
          <Feather name="minus" size={18} color={value === 0 ? '#FFF' : '#A0AEC0'} />
          <Text style={[styles.optionText, value === 0 && styles.optionTextActive]}>Normal</Text>
        </TouchableOpacity>

        {/* Opção MELHOR (1) */}
        <TouchableOpacity 
          style={[styles.optionBtn, value === 1 && styles.optionBtnGood]} 
          onPress={() => onChange(1)}
        >
          <Feather name="thumbs-up" size={18} color={value === 1 ? '#FFF' : '#A0AEC0'} />
          <Text style={[styles.optionText, value === 1 && styles.optionTextActive]}>Melhor</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
};

export default function DaldaModal({ visible, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  // Estados dos inputs (0 = Normal é o padrão para agilizar)
  const [routine, setRoutine] = useState(0);
  const [sleep, setSleep] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [motivation, setMotivation] = useState(0);
  const [focus, setFocus] = useState(0);

  const handleSave = async () => {
    setLoading(true);
    try {
      await submitDailyCheckin({
        source_routine: routine,
        source_sleep: sleep,
        symptom_energy: energy,
        symptom_motivation: motivation,
        symptom_focus: focus
      });
      
      onSuccess(); // Recarrega o dashboard
      onClose();   // Fecha modal
      
      // Reset para a próxima vez
      setTimeout(() => {
        setRoutine(0); setSleep(0); setEnergy(0); setMotivation(0); setFocus(0);
      }, 500);

    } catch (e: any) {
      if (e.code === '23505') {
        Alert.alert('Já registrado', 'Você já fez o check-in de hoje!');
        onClose();
      } else {
        Alert.alert('Erro', 'Não foi possível salvar o check-in.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Check-in Diário</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={24} color="#718096" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.subtitle}>
            Responda rápido. Como você está se sentindo em comparação ao seu "normal"?
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Demandas Externas</Text>
            <MetricSelector label="Rotina / Trabalho" value={routine} onChange={setRoutine} />
            <MetricSelector label="Sono / Recuperação" value={sleep} onChange={setSleep} />
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sintomas Internos</Text>
            <MetricSelector label="Nível de Energia" value={energy} onChange={setEnergy} />
            <MetricSelector label="Motivação" value={motivation} onChange={setMotivation} />
            <MetricSelector label="Foco Mental" value={focus} onChange={setFocus} />
          </View>

        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.saveButton} 
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveButtonText}>Salvar e Ver Análise</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E2E8F0' },
  title: { fontSize: 20, fontWeight: '800', color: '#2D3748' },
  
  scrollContent: { padding: 20 },
  subtitle: { fontSize: 14, color: '#718096', marginBottom: 24, lineHeight: 20 },
  
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#A0AEC0', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },

  selectorContainer: { marginBottom: 20 },
  selectorLabel: { fontSize: 16, fontWeight: '600', color: '#2D3748', marginBottom: 8 },
  optionsRow: { flexDirection: 'row', gap: 10 },
  
  optionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E0', borderRadius: 10, gap: 6 },
  optionBtnBad: { backgroundColor: '#FC8181', borderColor: '#FC8181' }, // Vermelho suave
  optionBtnNeutral: { backgroundColor: '#CBD5E0', borderColor: '#CBD5E0' }, // Cinza
  optionBtnGood: { backgroundColor: '#68D391', borderColor: '#68D391' }, // Verde suave
  
  optionText: { fontSize: 13, fontWeight: '600', color: '#A0AEC0' },
  optionTextActive: { color: '#FFF' },

  footer: { padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E2E8F0', paddingBottom: 40 },
  saveButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});