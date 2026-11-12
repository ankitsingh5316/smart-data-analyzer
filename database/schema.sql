-- Smart Data Analyzer
-- Dynamic datasets are stored as JSON rows so each upload can have its own columns.
-- Column names live in dataset_columns and are whitelisted before they are used in SQL.

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  preferences JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signup_otps (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_signup_otps_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reset_user (user_id, created_at),
  KEY idx_reset_hash (token_hash),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasets (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  file_type ENUM('csv', 'xlsx', 'xls') NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  column_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  missing_value_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_datasets_user_created (user_id, created_at),
  KEY idx_datasets_user_status (user_id, status),
  CONSTRAINT fk_datasets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_columns (
  id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NOT NULL,
  column_name VARCHAR(180) NOT NULL,
  column_key VARCHAR(64) NOT NULL,
  data_type ENUM('string', 'number', 'date', 'boolean') NOT NULL DEFAULT 'string',
  ordinal INT UNSIGNED NOT NULL,
  null_count INT UNSIGNED NOT NULL DEFAULT 0,
  unique_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dataset_column_key (dataset_id, column_key),
  KEY idx_columns_dataset_ordinal (dataset_id, ordinal),
  CONSTRAINT fk_columns_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id CHAR(36) NOT NULL,
  row_index INT UNSIGNED NOT NULL,
  row_hash CHAR(64) NOT NULL,
  data JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_records_dataset_row (dataset_id, row_index),
  KEY idx_records_dataset_hash (dataset_id, row_hash),
  CONSTRAINT fk_records_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_filters (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  logic ENUM('AND', 'OR') NOT NULL DEFAULT 'AND',
  conditions JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_filters_user_dataset (user_id, dataset_id, updated_at),
  CONSTRAINT fk_filters_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_filters_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NULL,
  saved_filter_id CHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  format ENUM('xlsx', 'csv', 'pdf') NOT NULL,
  selected_columns JSON NOT NULL,
  filter_snapshot JSON NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  file_path VARCHAR(500) NULL,
  file_size BIGINT UNSIGNED NULL,
  record_count INT UNSIGNED NULL,
  summary JSON NULL,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_reports_user_created (user_id, created_at),
  KEY idx_reports_user_status (user_id, status),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_filter FOREIGN KEY (saved_filter_id) REFERENCES saved_filters (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  action VARCHAR(32) NOT NULL,
  details VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_user_created (user_id, created_at),
  KEY idx_history_report (report_id, created_at),
  CONSTRAINT fk_history_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
