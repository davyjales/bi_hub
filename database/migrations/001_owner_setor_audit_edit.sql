-- Migração para bases MySQL/MariaDB já existentes (não reimporte schema.sql inteiro).
-- Execução: mysql -u USER -p DB_NAME < database/migrations/001_owner_setor_audit_edit.sql
--           ou cole no cliente (phpMyAdmin, etc.).
--
SET NAMES utf8mb4;

-- 1) Novo papel owner_setor (gestão de PBI apenas nas áreas atribuídas).
ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin',
    'viewer_all',
    'viewer_area',
    'owner_setor'
  ) NOT NULL;

-- 2) Acção audit 'edit' (PATCH relatório / renomeação + preview).
--    Ignorado se bi_file_audit ainda não existir (aplique 002/003 antes).
SET @db := DATABASE();
SET @audit_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bi_file_audit'
);
SET @sql := IF(
  @audit_exists > 0,
  'ALTER TABLE bi_file_audit MODIFY COLUMN action ENUM(''upload'', ''delete'', ''edit'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
