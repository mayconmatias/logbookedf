import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, 
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, 
  Alert, ScrollView, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import VideoPlayerModal from './VideoPlayerModal'; 
import { fetchMessages, sendMessage } from '@/services/feedback.service';
import { updateExerciseInstructions } from '@/services/exercises.service';
import { ExerciseMessage, ExerciseStaticData } from '@/types/feedback';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  visible: boolean;
  onClose: () => void;
  definitionId: string | null;
  exerciseName: string;
  userId: string | null;
  currentNotes?: string | null;
  currentVideoUrl?: string | null;
}

const MessageBubble = ({ message, isCurrentUser }: { message: ExerciseMessage, isCurrentUser: boolean }) => {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date(message.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <View style={[styles.messageContainer, isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft]}>
      <View style={[styles.bubble, isCurrentUser ? styles.bubbleRight : styles.bubbleLeft]}>
        <Text style={[styles.senderRole, { color: isCurrentUser ? '#FFF' : (message.sender_role === 'coach' ? '#9F7AEA' : '#4A5568') }]}>
          {message.sender_role === 'coach' ? 'Coach' : 'Atleta'}
        </Text>
        <Text style={[styles.messageText, isCurrentUser ? { color: '#FFF' } : { color: '#1A202C' }]}>
          {message.message}
        </Text>
        <Text style={[styles.messageTime, isCurrentUser ? { color: 'rgba(255,255,255,0.7)' } : { color: '#718096' }]}>
          {date} às {time}
        </Text>
      </View>
    </View>
  );
};

export const ExerciseFeedbackModal = ({ visible, onClose, definitionId, exerciseName, userId, currentNotes, currentVideoUrl }: Props) => {
  
  // Chat States
  const [messages, setMessages] = useState<ExerciseMessage[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  
  // Data & Edit States
  const [staticData, setStaticData] = useState<ExerciseStaticData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editVideo, setEditVideo] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Visual States
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<ExerciseMessage>>(null);

  // 1. Fetch User ID
  useEffect(() => {
    const fetchUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
    };
    fetchUser();
  }, []);

  // 2. Fetch Dados ao abrir
  const loadData = useCallback(async () => {
    if (!definitionId || !userId) return;
    
    // Dados Estáticos
    const { data } = await supabase
      .from('exercise_definitions')
      .select('default_notes, video_url')
      .eq('id', definitionId)
      .single();
    
    if (data) {
      setStaticData(data as ExerciseStaticData);
      setEditNotes(data.default_notes || '');
      setEditVideo(data.video_url || '');
    }

    // Mensagens
    setLoadingMsg(true);
    const msgs = await fetchMessages(definitionId, userId);
    setMessages(msgs);
    setLoadingMsg(false);
  }, [definitionId, userId]);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  // Scroll Chat
  useEffect(() => {
    if (visible && messages.length > 0 && !loadingMsg) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 300);
    }
  }, [messages, visible, loadingMsg]);

  // --- Handlers ---

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !definitionId || !userId || !currentUserId) return;
    try {
      const role = userId === currentUserId ? 'aluno' : 'coach';
      await sendMessage(definitionId, userId, currentUserId, newMessage.trim(), role);
      setNewMessage('');
      Keyboard.dismiss();
      // Recarrega chat
      const msgs = await fetchMessages(definitionId, userId);
      setMessages(msgs);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    }
  };

  const handleSaveEdits = async () => {
    if (!definitionId) return;
    setSavingEdit(true);
    try {
      await updateExerciseInstructions(definitionId, editNotes, editVideo);
      setIsEditing(false);
      setStaticData({ default_notes: editNotes, video_url: editVideo });
      Alert.alert('Sucesso', 'Instruções atualizadas.');
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao salvar: ' + e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  if (!definitionId || !userId) return null;

  // Lógica de Prioridade
  const displayVideo = currentVideoUrl || staticData?.video_url || '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.contentContainer}>

            {/* --- TERÇO 1: VÍDEO & HEADER --- */}
            <View style={styles.topSection}>
              <View style={styles.headerRow}>
                <Text style={styles.exerciseTitle} numberOfLines={1}>{exerciseName}</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Feather name="x" size={24} color="#4A5568" />
                </TouchableOpacity>
              </View>

              {isEditing ? (
                <View style={styles.editVideoContainer}>
                  <Text style={styles.label}>Link do Vídeo (Padrão)</Text>
                  <TextInput style={styles.inputEdit} value={editVideo} onChangeText={setEditVideo} placeholder="https://..." autoCapitalize="none" />
                </View>
              ) : (
                <View style={styles.videoContainer}>
                  {displayVideo ? (
                    <TouchableOpacity onPress={() => setVideoModalVisible(true)} style={[styles.videoPreview, currentVideoUrl ? {backgroundColor:'#2F855A'} : {}]}>
                      <Feather name="play-circle" size={48} color="#FFF" />
                      <Text style={styles.videoText}>
                        {currentVideoUrl ? 'Vídeo Específico do Treino' : 'Ver Execução Padrão'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noVideoState}>
                      <Feather name="video-off" size={24} color="#CBD5E0" />
                      <Text style={styles.noVideoText}>Sem vídeo cadastrado</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* --- TERÇO 2: INSTRUÇÕES --- */}
            <View style={styles.middleSection}>
              <View style={styles.sectionHeader}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <Feather name="file-text" size={14} color="#718096" />
                  <Text style={styles.sectionTitle}>INSTRUÇÕES TÉCNICAS</Text>
                </View>
                {!isEditing && (
                  <TouchableOpacity onPress={() => setIsEditing(true)}>
                    <Feather name="edit-2" size={16} color="#3182CE" />
                  </TouchableOpacity>
                )}
              </View>
              
              {isEditing ? (
                <View style={{flex: 1}}>
                   <TextInput style={[styles.inputEdit, styles.textAreaEdit]} value={editNotes} onChangeText={setEditNotes} multiline textAlignVertical="top" placeholder="Escreva detalhes de execução..." />
                   <TouchableOpacity onPress={handleSaveEdits} disabled={savingEdit} style={{alignSelf:'flex-end', marginTop:8}}>
                      {savingEdit ? <ActivityIndicator size="small" color="#3182CE"/> : <Text style={styles.saveLink}>Salvar Alterações Globais</Text>}
                   </TouchableOpacity>
                </View>
              ) : (
                <ScrollView style={styles.notesScroll} contentContainerStyle={{flexGrow: 1}}>
                  
                  {/* Bloco de Nota Específica */}
                  {currentNotes && (
                    <View style={styles.coachNoteBox}>
                      <View style={{flexDirection:'row', alignItems:'center', gap: 6, marginBottom: 4}}>
                        <Feather name="user-check" size={14} color="#2F855A" />
                        <Text style={styles.coachNoteTitle}>Nota do Treinador:</Text>
                      </View>
                      <Text style={styles.coachNoteText}>{currentNotes}</Text>
                    </View>
                  )}

                  {/* Nota Padrão */}
                  {staticData?.default_notes ? (
                    <Text style={styles.instructionText}>{staticData.default_notes}</Text>
                  ) : (
                    !currentNotes && <Text style={styles.emptyText}>Nenhuma instrução cadastrada.</Text>
                  )}
                </ScrollView>
              )}
            </View>

            {/* --- TERÇO 3: CHAT --- */}
            <View style={styles.bottomSection}>
              <View style={styles.sectionHeader}>
                <Feather name="message-circle" size={14} color="#718096" />
                <Text style={styles.sectionTitle}>FEEDBACK & HISTÓRICO</Text>
              </View>

              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <MessageBubble message={item} isCurrentUser={item.sender_id === currentUserId} />
                )}
                contentContainerStyle={styles.chatListContent}
                ListEmptyComponent={
                  !loadingMsg ? <Text style={styles.emptyText}>Envie uma observação sobre a execução...</Text> : <ActivityIndicator />
                }
              />

              <View style={styles.inputArea}>
                <TextInput
                  style={styles.input}
                  placeholder="Escreva aqui..."
                  placeholderTextColor="#A0AEC0"
                  value={newMessage}
                  onChangeText={setNewMessage}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]} 
                  onPress={handleSendMessage}
                  disabled={!newMessage.trim()}
                >
                  <Feather name="send" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <VideoPlayerModal visible={videoModalVisible} videoUrl={displayVideo} onClose={() => setVideoModalVisible(false)} />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  contentContainer: { flex: 1, flexDirection: 'column' },
  topSection: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFF', padding: 16 },
  middleSection: { flex: 1.2, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F7FAFC', padding: 16 },
  bottomSection: { flex: 1.2, backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 16 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  exerciseTitle: { fontSize: 18, fontWeight: '800', color: '#2D3748', flex: 1, marginRight: 10 },
  closeBtn: { padding: 4 },
  
  videoContainer: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  videoPreview: { flex: 1, backgroundColor: '#2D3748', justifyContent: 'center', alignItems: 'center' },
  videoText: { color: '#FFF', marginTop: 8, fontWeight: '600' },
  noVideoState: { flex: 1, backgroundColor: '#EDF2F7', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  noVideoText: { color: '#A0AEC0', marginTop: 8, fontSize: 12 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 6 },
  saveLink: { color: '#3182CE', fontWeight: 'bold', fontSize: 14 },

  instructionText: { fontSize: 15, color: '#2D3748', lineHeight: 22 },
  notesScroll: { flex: 1 },

  // Estilos da Nota Específica
  coachNoteBox: {
    backgroundColor: '#F0FFF4',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#38A169',
    marginBottom: 16
  },
  coachNoteTitle: { fontSize: 12, fontWeight: '700', color: '#276749' },
  coachNoteText: { fontSize: 14, color: '#22543D', lineHeight: 20 },

  emptyText: { fontStyle: 'italic', color: '#A0AEC0', textAlign: 'center', marginTop: 20 },
  
  // Edit Styles
  editVideoContainer: { flex: 1, justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: '#718096', marginBottom: 6 },
  inputEdit: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E0', borderRadius: 8, padding: 10, fontSize: 14, color: '#2D3748' },
  textAreaEdit: { flex: 1, textAlignVertical: 'top' },

  // Chat
  chatListContent: { paddingBottom: 10, flexGrow: 1 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  input: { flex: 1, backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 80, fontSize: 14, marginRight: 8, color: '#2D3748' },
  sendButton: { backgroundColor: '#3182CE', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  sendButtonDisabled: { backgroundColor: '#CBD5E0' },

  messageContainer: { marginVertical: 4, width: '100%' },
  messageContainerLeft: { alignItems: 'flex-start' },
  messageContainerRight: { alignItems: 'flex-end' },
  bubble: { padding: 10, borderRadius: 12, maxWidth: '85%', minWidth: 100 },
  bubbleLeft: { backgroundColor: '#EDF2F7', borderBottomLeftRadius: 2 },
  bubbleRight: { backgroundColor: '#3182CE', borderBottomRightRadius: 2 },
  senderRole: { fontSize: 9, fontWeight: '800', marginBottom: 2, textTransform: 'uppercase' },
  messageText: { fontSize: 14, lineHeight: 18 },
  messageTime: { fontSize: 9, alignSelf: 'flex-end', marginTop: 4 },
});