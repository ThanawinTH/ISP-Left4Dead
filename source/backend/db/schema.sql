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

CREATE TABLE IF NOT EXISTS assignments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id INT NOT NULL,
  title        VARCHAR(190) NOT NULL,
  description  TEXT NULL,
  points       INT NOT NULL DEFAULT 0,
  due_at       DATETIME NOT NULL,
  visibility   ENUM('class','staff') NOT NULL DEFAULT 'class',   -- SRS-14
  staff_due_at DATETIME NULL,      -- the TAs' own deadline, earlier than the students'
  staff_note   TEXT NULL,          -- what the lecturer wants the TAs to do
  status       ENUM('notstarted','inprogress','done') NOT NULL DEFAULT 'notstarted',
  created_by   INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_class_due (classroom_id, due_at),                      -- we always sort by due date
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)   REFERENCES users(id)
) ENGINE=InnoDB;

-- An assignment can be given to several TAs, so the link lives in its own table
-- rather than a single owner column on assignments.
CREATE TABLE IF NOT EXISTS assignment_staff (
  assignment_id INT NOT NULL,
  user_id       INT NOT NULL,
  PRIMARY KEY (assignment_id, user_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)
) ENGINE=InnoDB;
