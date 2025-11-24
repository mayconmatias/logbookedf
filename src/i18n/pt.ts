/**
 * Objeto de internacionalização (i18n) para Português (pt-BR).
 */
const t = {
  // Strings comuns usadas em múltiplos locais
  common: {
    attention: 'Atenção',
    error: 'Erro',
    success: 'Sucesso',
    loading: 'Carregando...',
    save: 'Salvar',
    saving: 'Salvando...',
    saved: 'Salvo!',
    delete: 'Deletar',
    cancel: 'Cancelar',
    share: 'Compartilhar',
    exit: 'Apenas Sair',
    close: 'Fechar',
    nextExercise: 'Próximo exercício',
    yesAddOneMore: 'Sim, mais uma',
    unauthorized: 'Usuário não encontrado',
  },

  // ===================================================================
  // [NOVO] Strings de Autenticação (Login, Cadastro)
  // ===================================================================
  auth: {
    loginTitle: 'Entrar com CPF e senha',
    loginButton: 'Entrar',
    loginButtonLoading: 'Entrando...',
    signupTitle: 'Criar nova conta',
    signupButton: 'Criar conta',
    signupButtonLoading: 'Criando...',
    goToSignup: 'Criar nova conta',
    goToLogin: 'Já tenho conta',
    emailPlaceholder: 'email@exemplo.com',
    cpfPlaceholder: 'CPF (apenas números)',
    passwordPlaceholder: 'Senha',
    passwordMinChars: 'Senha (mínimo 6 caracteres)',
    errorTitle: 'Erro',
    errorLogin: 'Falha no login',
    errorSignup: 'Erro no cadastro',
    errorSignupMessage: 'Não foi possível criar a conta.',
    errorEmailNotConfirmed: 'Seu e-mail ainda não foi verificado. Por favor, cheque sua caixa de entrada.',
    errorCpfNotFound: 'CPF não encontrado',
    validationFields: 'Preencha todos os campos.',
    validationCpf: 'O CPF informado é inválido.', // <-- A nova string
    signupSuccessTitle: 'Cadastro enviado!',
    signupSuccessBody: 'Enviamos um link de confirmação para o seu e-mail. Por favor, verifique sua caixa de entrada para ativar sua conta.',
  },
  // ===================================================================

  // Strings específicas do LogWorkout
  logWorkout: {
    // ... (Seção logWorkout inalterada)
    deleteSetTitle: 'Deletar Série',
    deleteExerciseTitle: 'Deletar Exercício',
    templateCompleteTitle: 'Template Concluído!',
    setsCompleteTitle: 'Séries Completas',
    freeModeTitle: 'Modo Livre Ativado',
    workoutFinishedTitle: 'Treino Finalizado!',
    formValidation: 'Exercício, Peso e Repetições são obrigatórios.',
    unilateralValidation: 'Por favor, selecione o lado (Esquerdo ou Direito).',
    deleteSetBody: 'Tem certeza que deseja deletar esta série?',
    deleteExerciseBody: (exerciseName: string) =>
      `Tem certeza que deseja deletar "${exerciseName}" e todas as suas séries?`,
    templateCompleteBody:
      'Você finalizou todos os exercícios do template. Pode adicionar mais exercícios se quiser.',
    setsCompleteBody:
      'Você já registrou todas as séries prescritas, quer adicionar mais uma?',
    freeModeBody:
      'Você saiu do template. Agora pode adicionar qualquer exercício.',
    workoutFinishedBody: 'O que você gostaria de fazer?',
    formLoadingPRs: 'Carregando PRs...',
    formSaveSet: 'Salvar série',
    logTitleEdit: 'Editando Treino',
    logTitleNew: 'Registrando Sessão',
    emptyLog: 'Nenhuma série registrada ainda.',
    finishWorkoutButton: 'Finalizar Treino',
    updateWorkoutButton: 'Salvar e Fechar',
    addExerciseButton: 'Fazer mais um exercício',
    menuSkipToExercise: 'Pular para este exercício',
    menuReuseExercise: 'Re-usar nome no formulário',
  },

  // Strings do CreateTemplateScreen
  createTemplate: {
    // ... (Seção createTemplate inalterada)
    titleNew: 'Criar Novo Template',
    titleEdit: 'Editar Template',
    templateName: 'Nome do treino',
    templateNamePlaceholder: 'Ex: Treino A - Peito e Tríceps',
    notes: 'Notas (opcional)',
    notesPlaceholder: 'Ex: Focar na cadência, 3 min de descanso...',
    exercises: 'Exercícios',
    exercise: 'Exercício',
    exerciseName: 'Nome do Exercício',
    exerciseNamePlaceholder: 'Ex: Supino Reto',
    sets: 'Séries',
    setsPlaceholder: 'Ex: 3',
    reps: 'Reps',
    repsPlaceholder: 'Ex: 6-10',
    observation: 'Observação (opcional)',
    observationPlaceholder: 'Ex: Controlar a descida',
    unilateral: 'Exercício Unilateral',
    addExercise: 'Adicionar Exercício',
    saveTemplate: 'Salvar Template',
    updateTemplate: 'Atualizar Template',
    nameRequired: 'O nome do treino é obrigatório.',
    exerciseRequired: 'Adicione pelo menos um exercício ao template.',
    exerciseFieldsRequired:
      'Preencha o nome e o número de séries de pelo menos um exercício.',
    saveSuccess: 'Template salvo!',
    updateSuccess: 'Template atualizado!',
  },

  // Strings do AnalyticsSheet
  analytics: {
    // ... (Seção analytics inalterada)
    title: 'Analytics',
    subtitle: 'Progressão do Exercício',
    loading: 'Buscando seu progresso...',
    errorTitle: 'Erro ao carregar dados.',
    errorNoHistory: (name: string) => `Nenhum histórico salvo encontrado para "${name}".`,
    errorNoExercise: 'Não foi possível identificar o exercício.',
    errorNoData: 'Nenhum dado de progressão encontrado.',
    streakTitle: 'Sequência de PRs',
    streakUnitOne: 'treino',
    streakUnitMany: 'treinos',
    streakConsecutive: 'consecutivos',
    daysSincePRUnitOne: 'dia',
    daysSincePRUnitMany: 'dias',
    daysSincePRPrefix: 'desde o último PR',
    performanceTitle: 'vs. Sessão Anterior',
    performanceNoData: 'Sem dados da sessão anterior.',
    performanceNoCurrent: 'Série atual não registrada.',
    chartToggleForce: 'Força',
    chartToggleVolume: 'Volume',
    chartNoData: 'Dados insuficientes para o gráfico.',
    chartNoDataSubtitle: '(É preciso ao menos 2 sessões)',
    historyTitle: 'Seus Recordes (PRs)',
    historyNoData: 'Nenhum recorde encontrado.',
  },
};

export default t;