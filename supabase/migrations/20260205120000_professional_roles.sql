-- Migration: 20260205_professional_roles.sql
-- Description: Implementa restrições de acesso baseadas em função (Professional/Trainer vs Admin)

-- 1. Garante que RLS está ativo nas tabelas críticas
ALTER TABLE public.exercise_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Função auxiliar para verificar se é Admin ou Moderador
CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND subscription_plan IN ('admin', 'moderator')
  );
$$;

-- 3. Políticas para Exercise Definitions (Exercícios)
-- A. Leitura: Todos podem ler exercícios do sistema e seus próprios
CREATE POLICY "Leitura de Exercícios" ON public.exercise_definitions
FOR SELECT
USING (
  is_system = true OR user_id = auth.uid()
);

-- B. Modificação (System): Apenas Admins/Moderadores podem alterar exercícios do sistema
CREATE POLICY "Admin Modifica Sistema" ON public.exercise_definitions
FOR ALL
USING (
  is_admin_or_moderator()
)
WITH CHECK (
  is_admin_or_moderator()
);

-- C. Modificação (Personal): Usuários (incluindo Treinadores) só podem alterar seus próprios exercícios privados
CREATE POLICY "Usuario Modifica Prorios" ON public.exercise_definitions
FOR ALL
USING (
  user_id = auth.uid() AND is_system = false
)
WITH CHECK (
  user_id = auth.uid() AND is_system = false
);


-- 4. Políticas para Programs (Programas de Treino)
-- A. Leitura: Aluno dono, Coach dono, ou Admin
CREATE POLICY "Leitura de Programas" ON public.programs
FOR SELECT
USING (
  student_id = auth.uid() -- Sou o Aluno
  OR coach_id = auth.uid() -- Sou o Treinador
  OR is_admin_or_moderator() -- Sou Admin
);

-- B. Criação/Edição: Coach só pode criar/editar se ele for o coach_id
-- E o student_id deve ser um aluno dele (validado via trigger ou app, aqui focamos no owner)
CREATE POLICY "Gestao de Programas" ON public.programs
FOR ALL
USING (
  coach_id = auth.uid() OR student_id = auth.uid()
)
WITH CHECK (
  coach_id = auth.uid() OR student_id = auth.uid()
);

-- 5. Restrição de "Backend Structure" (Ex: Tabelas de Configuração se existirem)
-- Assumindo que tabelas de sistema não devem ser tocadas por treinadores.
-- Exemplo genérico, ajustar conforme tabelas reais de config.

-- NOTA: A parte de "não conseguem alterar a estrutura do backend" já é garantida
-- pelo fato de que eles não são superusers do banco (postgres/dashboard role).
-- Eles logam como 'authenticated' que não tem permissão de ALTER TABLE.

