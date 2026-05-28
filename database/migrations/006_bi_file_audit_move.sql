-- Acção 'move' e coluna old_area_key no histórico de ficheiros .pbix
-- Uso: npm run migrate -- 006_bi_file_audit_move.sql   (na pasta server)

SET NAMES utf8mb4;

SET @db := DATABASE();
SET @audit_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bi_file_audit'
);

SET @sql := IF(
  @audit_exists > 0,
  'ALTER TABLE bi_file_audit MODIFY COLUMN action ENUM(''upload'', ''delete'', ''edit'', ''move'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bi_file_audit' AND COLUMN_NAME = 'old_area_key'
);
SET @sql := IF(
  @audit_exists > 0 AND @col_exists = 0,
  'ALTER TABLE bi_file_audit ADD COLUMN old_area_key VARCHAR(160) NULL AFTER area_key',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
