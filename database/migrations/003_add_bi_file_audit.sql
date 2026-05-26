-- Migração: cria tabela de histórico de ações em BI's (upload/delete)
-- Seguro para rodar em banco já existente.
--
-- Uso (exemplo):
--   mysql -u <user> -p <database> < database/migrations/003_add_bi_file_audit.sql

SET NAMES utf8mb4;

-- 1) Cria a tabela se ainda não existir
CREATE TABLE IF NOT EXISTS bi_file_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  username VARCHAR(64) NOT NULL,
  action ENUM('upload', 'delete') NOT NULL,
  area_key VARCHAR(160) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bi_file_audit_user (user_id),
  KEY idx_bi_file_audit_area (area_key),
  KEY idx_bi_file_audit_created (created_at),
  CONSTRAINT fk_bi_file_audit_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Se a tabela já existir, garante índices (MySQL não tem CREATE INDEX IF NOT EXISTS)
SET @db := DATABASE();

-- idx_bi_file_audit_user
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bi_file_audit' AND INDEX_NAME = 'idx_bi_file_audit_user'
);
SET @sql := IF(@exists = 0, 'CREATE INDEX idx_bi_file_audit_user ON bi_file_audit (user_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_bi_file_audit_area
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bi_file_audit' AND INDEX_NAME = 'idx_bi_file_audit_area'
);
SET @sql := IF(@exists = 0, 'CREATE INDEX idx_bi_file_audit_area ON bi_file_audit (area_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_bi_file_audit_created
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bi_file_audit' AND INDEX_NAME = 'idx_bi_file_audit_created'
);
SET @sql := IF(@exists = 0, 'CREATE INDEX idx_bi_file_audit_created ON bi_file_audit (created_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

