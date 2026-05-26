-- Histórico de upload/exclusão de ficheiros .pbix (executar após schema.sql base).
-- Uso: mysql -u root -p bi_hub < database/migrations/002_bi_file_audit.sql

SET NAMES utf8mb4;

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
  KEY idx_bi_file_audit_created (created_at),
  KEY idx_bi_file_audit_user (user_id),
  KEY idx_bi_file_audit_area (area_key),
  CONSTRAINT fk_bi_file_audit_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
