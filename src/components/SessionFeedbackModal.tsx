import React, { useState } from 'react';
import { 
  Modal, View, Text, StyleSheet, TouchableOpacity, 
  TextInput, ActivityIndicator, ScrollView, Alert 
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { supabase } from '@/lib/supabaseClient';

interface FeedbackConfig {
  collect_rpe: boolean;
  collect_dalda: boolean;
  custom_questions: string[];
}

interface Props {
  visible: boolean;
  workoutId: string | null;
  config: FeedbackConfig | null; // Configuração vinda do Programa
  onClose: () => void;
  onSuccess: () => void;
}

export default function SessionFeedbackModal({ visible, workoutId, config, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  
  // Estados do Formulário
  const [rpe, setRpe] = useState(5); // 0-10
  const [comment, setComment] = useState('');
  
  // DALDA simplificado (Key: Valor -1, 0, 1)
  const [dalda, setDalda] = useState<Record<string, number>>({
    'sono': 0, 'energia': 0, 'dor_muscular': 0, 'estresse': 0
  });

  // Respostas customizadas (Pergunta: Resposta)
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  const handleSave = async () => {
    if (!workoutId) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não logado');

      const payload = {
        workout_id: workoutId,
        user_id: user.id,
        general_comment: comment,
        // Só envia se foi solicitado na config, senão null
        rpe_score: config?.collect_rpe ? rpe : null,
        dalda_scores: config?.collect_dalda ? dalda : null,
        custom_answers: config?.custom_questions?.length ? customAnswers : null
      };

      // [CORREÇÃO] Usamos upsert em vez de insert.
      // onConflict: 'workout_id' garante que se já existir feedback para este treino,
      // ele será ATUALIZADO em vez de tentar criar um duplicado.
      const { error } = await supabase
        .from('workout_feedbacks')
        .upsert(payload, { onConflict: 'workout_id' });

      if (error) throw error;

      onSuccess(); // Fecha e finaliza navegação
    } catch (e: any) {
      console.error(e); // Log para debug
      Alert.alert('Erro', 'Não foi possível salvar o feedback: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderDaldaItem = (key: string, label: string) => (
    <View style={styles.daldaRow}>
      <Text style={styles.daldaLabel}>{label}</Text>
      <View style={styles.daldaOptions}>
        {[-1, 0, 1].map((val) => (
          <TouchableOpacity 
            key={val} 
            style={[styles.daldaBtn, dalda[key] === val && styles.daldaBtnActive(val)]}
            onPress={() => setDalda(prev => ({...prev, [key]: val}))}
          >
            <Feather 
              name={val === -1 ? 'thumbs-down' : val === 1 ? 'thumbs-up' : 'minus'} 
              size={16} 
              color={dalda[key] === val ? '#FFF' : '#A0AEC0'} 
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Como foi o treino?</Text>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={24} color="#A0AEC0" /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          
          {/* 1. PSE / RPE (Slider) */}
          {(config?.collect_rpe ?? true) && ( // Default true se config for null (treino livre)
            <View style={styles.section}>
              <View style={styles.labelRow}>
                <Text style={styles.sectionTitle}>Esforço Percebido (0-10)</Text>
                <Text style={styles.rpeValue}>{rpe}</Text>
              </View>
              <Slider
                style={{width: '100%', height: 40}}
                minimumValue={0}
                maximumValue={10}
                step={0.5}
                value={rpe}
                onValueChange={setRpe}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#E2E8F0"
                thumbTintColor="#007AFF"
              />
              <View style={styles.rpeLabels}>
                <Text style={styles.subText}>Muito Leve</Text>
                <Text style={styles.subText}>Exaustão</Text>
              </View>
            </View>
          )}

          {/* 2. DALDA (Bem-estar) */}
          {config?.collect_dalda && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Prontidão & Recuperação</Text>
              <Text style={styles.subText}>Comparado ao seu normal:</Text>
              <View style={{marginTop: 12, gap: 12}}>
                {renderDaldaItem('sono', 'Qualidade do Sono')}
                {renderDaldaItem('energia', 'Nível de Energia')}
                {renderDaldaItem('dor_muscular', 'Dor Muscular')}
                {renderDaldaItem('estresse', 'Nível de Estresse')}
              </View>
            </View>
          )}

          {/* 3. Perguntas Personalizadas */}
          {config?.custom_questions?.map((q, idx) => (
            <View key={idx} style={styles.section}>
              <Text style={styles.sectionTitle}>{q}</Text>
              <TextInput
                style={styles.input}
                placeholder="Sua resposta..."
                value={customAnswers[q] || ''}
                onChangeText={(t) => setCustomAnswers(prev => ({...prev, [q]: t}))}
              />
            </View>
          ))}

          {/* 4. Comentário Geral (Sempre ativo) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observações Gerais</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Algum desconforto? Faltou tempo?..."
              multiline
              value={comment}
              onChangeText={setComment}
            />
          </View>

        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Enviar Feedback e Finalizar</Text>}
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
  content: { padding: 20, paddingBottom: 40 },
  
  section: { marginBottom: 24, backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#4A5568', marginBottom: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rpeValue: { fontSize: 24, fontWeight: '900', color: '#007AFF' },
  rpeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  subText: { fontSize: 12, color: '#A0AEC0' },

  daldaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  daldaLabel: { fontSize: 14, color: '#2D3748', flex: 1 },
  daldaOptions: { flexDirection: 'row', gap: 8 },
  daldaBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDF2F7' },
  // Função helper para estilo dinâmico
  daldaBtnActive: (val: number) => ({
    backgroundColor: val === -1 ? '#FC8181' : val === 1 ? '#68D391' : '#CBD5E0'
  }),

  input: { backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#CBD5E0', borderRadius: 8, padding: 12, fontSize: 15, marginTop: 8 },
  textArea: { height: 80, textAlignVertical: 'top' },

  footer: { padding: 20, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E2E8F0' },
  saveButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});