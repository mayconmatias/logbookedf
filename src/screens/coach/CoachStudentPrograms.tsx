import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '@/types/navigation';
import { Program } from '@/types/coaching';
import {
  fetchStudentPrograms,
  createProgram,
  setProgramActive,
  renameProgram,
  deleteProgram,
  // [NOVO] Importações
  fetchCoachTemplates,
  assignTemplateToStudent
} from '@/services/program.service';
import { supabase } from '@/lib/supabaseClient';

type Props = NativeStackScreenProps<RootStackParamList, 'CoachStudentPrograms'>;

export default function CoachStudentPrograms({ navigation, route }: Props) {
  const { studentId, studentName } = route.params;
  const insets = useSafeAreaInsets();

  // Lista de programas do ALUNO
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  // IA States
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // [NOVO] Template States
  const [isTemplateModalVisible, setIsTemplateModalVisible] = useState(false);
  const [myTemplates, setMyTemplates] = useState<Program[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Programas de ${studentName}` });
  }, [navigation, studentName]);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStudentPrograms(studentId);
      setPrograms(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      loadPrograms();
    }, [loadPrograms])
  );

  // --- [NOVO] Estados para o Modal de Input (Substituto do Alert.prompt) ---
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [inputModalTitle, setInputModalTitle] = useState('');
  const [inputModalValue, setInputModalValue] = useState('');
  const [inputModalPlaceholder, setInputModalPlaceholder] = useState('');
  const [onInputConfirm, setOnInputConfirm] = useState<((text: string) => Promise<void>) | null>(null);

  // --- AÇÃO: ABRIR MODAL DE TEMPLATES ---
  const handleOpenTemplateModal = async () => {
    setIsTemplateModalVisible(true);
    setLoadingTemplates(true);
    try {
      const data = await fetchCoachTemplates();
      setMyTemplates(data);
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao carregar templates.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSelectTemplate = async (template: Program) => {
    Alert.alert(
      'Aplicar Template',
      `Deseja criar um novo programa para ${studentName} usando "${template.name}" como base?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setIsTemplateModalVisible(false);
              setLoading(true); // Mostra loading na tela principal
              await assignTemplateToStudent(template.id, studentId);
              await loadPrograms(); // Recarrega a lista do aluno
              Alert.alert('Sucesso', 'Programa criado a partir do template!');
            } catch (e: any) {
              Alert.alert('Erro', e.message);
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // --- OUTRAS AÇÕES (Mantidas) ---
  const handleCreateProgram = () => {
    setInputModalTitle('Novo Programa (Vazio)');
    setInputModalPlaceholder('Nome do programa (ex: Hipertrofia A)');
    setInputModalValue('');
    setOnInputConfirm(() => async (name: string) => {
      if (!name || !name.trim()) return;
      setLoading(true);
      try {
        await createProgram(studentId, name);
        await loadPrograms();
      } catch (e: any) {
        Alert.alert('Erro', e.message);
        setLoading(false);
      }
    });
    setInputModalVisible(true);
  };

  const handleCreateProgramWithAI = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    Keyboard.dismiss();
    try {
      const { data: aiRes, error: aiError } = await supabase.functions.invoke('parse-workout', { body: { text: aiText } });
      if (aiError) throw new Error(aiError.message);
      if (!aiRes || !aiRes.data) throw new Error("Resposta inválida da IA.");

      const { error: dbError } = await supabase.rpc('import_full_program_json', {
        p_student_id: studentId,
        p_program_data: aiRes.data
      });
      if (dbError) throw new Error(dbError.message);

      Alert.alert('Sucesso', 'Programa criado com IA!');
      setAiText('');
      setIsAiModalVisible(false);
      loadPrograms();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleOptions = (program: Program) => {
    Alert.alert(
      program.name,
      'Opções do Programa:',
      [
        {
          text: program.is_active ? 'Já está Ativo' : 'Tornar Ativo',
          onPress: async () => {
            if (program.is_active) return;
            setLoading(true);
            try {
              await setProgramActive(program.id);
              await loadPrograms();
              Alert.alert('Sucesso', 'Programa ativado!');
            } catch (e: any) { Alert.alert('Erro', e.message); setLoading(false); }
          }
        },
        {
          text: 'Renomear',
          onPress: () => {
            setInputModalTitle('Renomear');
            setInputModalPlaceholder('Novo nome');
            setInputModalValue(program.name);
            setOnInputConfirm(() => async (n: string) => {
              if (!n || !n.trim()) return;
              setLoading(true);
              await renameProgram(program.id, n);
              loadPrograms();
            });
            setInputModalVisible(true);
          }
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Tem certeza?', 'Isso apagará o programa.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Apagar', style: 'destructive', onPress: async () => {
                  setLoading(true);
                  await deleteProgram(program.id);
                  loadPrograms();
                }
              }
            ]);
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#007AFF" />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="clipboard" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>Sem programas.</Text>
              <Text style={styles.emptySubText}>Use um Template, IA ou crie manualmente.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.is_active && styles.activeCard]}
              onPress={() => navigation.navigate('CoachProgramDetails', { program: item })}
              onLongPress={() => handleOptions(item)}
              delayLongPress={300}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Feather name={item.is_active ? "check-circle" : "folder"} size={20} color={item.is_active ? "#007AFF" : "#718096"} />
                  <Text style={[styles.programName, item.is_active && { color: '#007AFF' }]}>{item.name}</Text>
                </View>
                {item.is_active && <View style={styles.badge}><Text style={styles.badgeText}>ATIVO</Text></View>}
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.date}>Criado em {new Date(item.created_at).toLocaleDateString('pt-BR')}</Text>
                <Feather name="chevron-right" size={20} color="#CBD5E0" />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* --- FABs --- */}

      {/* Botão Template (Verde) */}
      <TouchableOpacity
        style={[styles.fab, styles.fabTemplate]}
        onPress={handleOpenTemplateModal}
      >
        <Feather name="copy" size={24} color="#FFF" />
        <Text style={styles.fabText}>Usar Template</Text>
      </TouchableOpacity>

      {/* Botão IA (Roxo) */}
      <TouchableOpacity
        style={[styles.fab, styles.fabAi]}
        onPress={() => setIsAiModalVisible(true)}
      >
        <Feather name="cpu" size={24} color="#FFF" />
        <Text style={styles.fabText}>Criar com IA</Text>
      </TouchableOpacity>

      {/* Botão Manual (Azul) */}
      <TouchableOpacity style={styles.fab} onPress={handleCreateProgram}>
        <Feather name="plus" size={24} color="#FFF" />
        <Text style={styles.fabText}>Novo Manual</Text>
      </TouchableOpacity>


      {/* --- MODAL TEMPLATES --- */}
      <Modal visible={isTemplateModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Meus Templates</Text>
            <TouchableOpacity onPress={() => setIsTemplateModalVisible(false)}>
              <Text style={styles.closeText}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          {loadingTemplates ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#007AFF" />
          ) : (
            <FlatList
              data={myTemplates}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text style={styles.emptyTextModal}>Você não possui templates. Crie um programa e marque como template ou compre na loja.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.templateCard} onPress={() => handleSelectTemplate(item)}>
                  <View style={styles.iconBoxTemplate}>
                    <Feather name="layers" size={24} color="#38A169" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateTitle}>{item.name}</Text>
                    <Text style={styles.templateSub}>Toque para aplicar</Text>
                  </View>
                  <Feather name="arrow-right-circle" size={24} color="#CBD5E0" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* --- MODAL IA --- */}
      <Modal visible={isAiModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Criar com IA</Text>
            <TouchableOpacity onPress={() => setIsAiModalVisible(false)}>
              <Text style={styles.closeText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16, flex: 1 }}>
            <Text style={styles.modalSub}>Cole o treino completo aqui...</Text>
            <TextInput
              style={styles.aiInput} multiline placeholder="Ex: Treino A: Peito..."
              value={aiText} onChangeText={setAiText} autoFocus
            />
            <TouchableOpacity style={styles.aiButton} onPress={handleCreateProgramWithAI} disabled={aiLoading}>
              {aiLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.aiButtonText}>Gerar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL INPUT (Custom Alert.prompt) --- */}
      <Modal visible={inputModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}
        >
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#2D3748' }}>{inputModalTitle}</Text>

            <TextInput
              style={{
                borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12,
                fontSize: 16, marginBottom: 20, backgroundColor: '#F7FAFC'
              }}
              placeholder={inputModalPlaceholder}
              value={inputModalValue}
              onChangeText={setInputModalValue}
              autoFocus
              onSubmitEditing={() => {
                setInputModalVisible(false);
                if (onInputConfirm) onInputConfirm(inputModalValue);
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setInputModalVisible(false)} style={{ padding: 10 }}>
                <Text style={{ color: '#718096', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setInputModalVisible(false);
                  if (onInputConfirm) onInputConfirm(inputModalValue);
                }}
                style={{ backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', padding: 16 },

  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  activeCard: { borderColor: '#007AFF', backgroundColor: '#F0F9FF' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  programName: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  badge: { backgroundColor: '#007AFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 28 },
  date: { fontSize: 12, color: '#718096' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#4A5568', marginTop: 16 },
  emptySubText: { fontSize: 14, color: '#718096', marginTop: 8 },

  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  fabText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },
  fabAi: { bottom: 84, backgroundColor: '#805AD5' },
  fabTemplate: { bottom: 144, backgroundColor: '#38A169' }, // Botão Verde no topo da pilha

  // Modais
  modalContainer: { flex: 1, backgroundColor: '#F7FAFC' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  closeText: { color: '#007AFF', fontSize: 16 },
  modalSub: { fontSize: 14, color: '#718096', marginBottom: 16 },
  aiInput: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, fontSize: 16, textAlignVertical: 'top', marginBottom: 16 },
  aiButton: { backgroundColor: '#805AD5', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aiButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  // Template Modal Styles
  templateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  iconBoxTemplate: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F0FFF4', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  templateTitle: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  templateSub: { fontSize: 12, color: '#A0AEC0' },
  emptyTextModal: { textAlign: 'center', color: '#718096', marginTop: 40, paddingHorizontal: 20 }
});