-- Adiciona coluna para armazenar metadados da música no momento do set
ALTER TABLE sets ADD COLUMN IF NOT EXISTS music_data JSONB;

-- Comentário na coluna para documentação
COMMENT ON COLUMN sets.music_data IS 'Metadados da música tocando durante o set (track, artist, bpm, etc)';
