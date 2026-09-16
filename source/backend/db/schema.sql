CREATE DATABASE IF NOT EXISTS ku_classroom
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ku_classroom;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  name          VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL      -- scrypt "salt:hash", never the password
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classrooms (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(190) NOT NULL,
  semester     VARCHAR(20)  NOT NULL,
  subject_code VARCHAR(32)  NULL,
  join_code    VARCHAR(12)  NOT NULL UNIQUE,   -- SRS-2
  owner_id     INT          NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS memberships (
  classroom_id INT NOT NULL,
  user_id      INT NOT NULL,
  role         ENUM('lecturer','ta','staff','student') NOT NULL DEFAULT 'student',
  PRIMARY KEY (classroom_id, user_id),
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)      REFERENCES users(id)
) ENGINE=InnoDB;
