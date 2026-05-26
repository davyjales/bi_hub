-- Visteon BI Hub — estrutura MySQL (MariaDB do XAMPP)
-- Charset utf8mb4 para suporte completo a acentuação.
-- Populate diretórios + admin com `npm run seed` dentro da pasta `server` (.env obrigatório).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS bi_file_audit;
DROP TABLE IF EXISTS user_directory_access;
DROP TABLE IF EXISTS hub_directories;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'viewer_all', 'viewer_area') NOT NULL,
  status ENUM('pending', 'approved') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada entrada representa um “diretório”/área (deve coincidir com o campo area dos relatórios no hub).
CREATE TABLE hub_directories (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  area_key VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hub_directories_area_key (area_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Utilizado quando role = viewer_area (um usuário pode ter vários diretórios).
CREATE TABLE user_directory_access (
  user_id INT UNSIGNED NOT NULL,
  hub_directory_id SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, hub_directory_id),
  CONSTRAINT fk_uda_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_uda_directory FOREIGN KEY (hub_directory_id) REFERENCES hub_directories (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico de inserção/exclusão de relatórios .pbix no armazenamento do servidor.
CREATE TABLE bi_file_audit (
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
