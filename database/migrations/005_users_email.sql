SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN email VARCHAR(255) NULL AFTER username;

ALTER TABLE users
  ADD UNIQUE KEY uq_users_email (email);