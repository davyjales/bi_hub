-- Histórico de criação/renomeação/exclusão de diretórios (gestão de pastas).
-- Uso: npm run migrate -- 004_hub_directory_audit.sql   (na pasta server)
-- ou: mysql -u USER -p NOME_DA_BASE < database/migrations/004_hub_directory_audit.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS hub_directory_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  username VARCHAR(64) NOT NULL,
  action ENUM('create', 'rename', 'delete') NOT NULL,
  area_key VARCHAR(160) NOT NULL,
  old_area_key VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hub_directory_audit_created (created_at),
  KEY idx_hub_directory_audit_user (user_id),
  KEY idx_hub_directory_audit_area (area_key),
  CONSTRAINT fk_hub_directory_audit_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
