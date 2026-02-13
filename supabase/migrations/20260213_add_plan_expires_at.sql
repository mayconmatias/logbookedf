-- Migration: Adiciona plan_expires_at à coaching_relationships e sincroniza com programs
-- Data: 2026-02-13
-- Descrição: Permite gestão centralizada de vencimento de planos por relacionamento coach-student

-- 1. Adicionar coluna plan_expires_at
ALTER TABLE coaching_relationships 
ADD COLUMN IF NOT EXISTS plan_expires_at timestamp with time zone;

-- 2. Popular dados existentes: pegar expires_at do programa ativo de cada aluno
UPDATE coaching_relationships cr
SET plan_expires_at = (
  SELECT expires_at 
  FROM programs p
  WHERE p.student_id = cr.student_id 
    AND p.coach_id = cr.coach_id
    AND p.is_active = true
  LIMIT 1
)
WHERE cr.plan_expires_at IS NULL;

-- 3. Criar função de sincronização bidirecional
CREATE OR REPLACE FUNCTION sync_plan_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando mudar expires_at do programa ATIVO, atualiza o relacionamento
  IF (TG_OP = 'UPDATE' AND NEW.is_active = true) OR (TG_OP = 'INSERT' AND NEW.is_active = true) THEN
    UPDATE coaching_relationships
    SET plan_expires_at = NEW.expires_at
    WHERE student_id = NEW.student_id
      AND coach_id = NEW.coach_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Criar trigger nos programas
DROP TRIGGER IF EXISTS trg_sync_plan_expiry_from_program ON programs;
CREATE TRIGGER trg_sync_plan_expiry_from_program
AFTER INSERT OR UPDATE OF expires_at, is_active ON programs
FOR EACH ROW
EXECUTE FUNCTION sync_plan_expiry();

-- 5. Criar função de sincronização reversa (coaching_relationships -> programs)
CREATE OR REPLACE FUNCTION sync_plan_expiry_to_programs()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando mudar plan_expires_at no relacionamento, atualiza o programa ativo
  IF NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN
    UPDATE programs
    SET expires_at = NEW.plan_expires_at
    WHERE student_id = NEW.student_id
      AND coach_id = NEW.coach_id
      AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Criar trigger no coaching_relationships
DROP TRIGGER IF EXISTS trg_sync_plan_expiry_to_programs ON coaching_relationships;
CREATE TRIGGER trg_sync_plan_expiry_to_programs
AFTER UPDATE OF plan_expires_at ON coaching_relationships
FOR EACH ROW
EXECUTE FUNCTION sync_plan_expiry_to_programs();

-- 7. Adicionar índice para performance
CREATE INDEX IF NOT EXISTS idx_coaching_relationships_plan_expires 
ON coaching_relationships(plan_expires_at) 
WHERE plan_expires_at IS NOT NULL;

-- 8. Comentários para documentação
COMMENT ON COLUMN coaching_relationships.plan_expires_at IS 
'Data de vencimento do plano do aluno. Sincroniza automaticamente com programs.expires_at do programa ativo via triggers.';

COMMENT ON FUNCTION sync_plan_expiry() IS 
'Sincroniza expires_at de programs (quando ativo) para coaching_relationships.plan_expires_at';

COMMENT ON FUNCTION sync_plan_expiry_to_programs() IS 
'Sincroniza plan_expires_at de coaching_relationships para programs.expires_at (programa ativo)';
