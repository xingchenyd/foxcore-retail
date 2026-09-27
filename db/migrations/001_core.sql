CREATE TABLE event_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  type VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE venues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  street VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  province VARCHAR(80) NOT NULL,
  postal_code VARCHAR(16) NOT NULL,
  description VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description VARCHAR(500),
  status ENUM('DRAFT','OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Toronto',
  tax_bps SMALLINT UNSIGNED,
  policy_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_events_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_events_category FOREIGN KEY (category_id) REFERENCES event_categories(id),
  CONSTRAINT ck_event_dates CHECK (end_date >= start_date),
  CONSTRAINT ck_event_tax CHECK (tax_bps IS NULL OR tax_bps <= 10000)
) ENGINE=InnoDB;

CREATE TABLE booths (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  location VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_booth_event_location (event_id,location),
  UNIQUE KEY uq_booth_id_event (id,event_id),
  CONSTRAINT fk_booths_event FOREIGN KEY (event_id) REFERENCES events(id)
) ENGINE=InnoDB;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  wholesale_cost_cents BIGINT UNSIGNED NOT NULL,
  min_price_cents BIGINT UNSIGNED NOT NULL,
  suggested_price_cents BIGINT UNSIGNED,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT ck_product_prices CHECK (suggested_price_cents IS NULL OR suggested_price_cents >= min_price_cents)
) ENGINE=InnoDB;

CREATE TABLE salespeople (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  street VARCHAR(120),
  city VARCHAR(80),
  province VARCHAR(80),
  postal_code VARCHAR(16),
  phone VARCHAR(32),
  description VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  commission_bps SMALLINT UNSIGNED,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT ck_commission_rate CHECK (commission_bps IS NULL OR commission_bps <= 10000)
) ENGINE=InnoDB;

CREATE TABLE shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  salesperson_id BIGINT UNSIGNED NOT NULL,
  booth_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  planned_start DATETIME(3) NOT NULL,
  planned_end DATETIME(3) NOT NULL,
  actual_start DATETIME(3),
  actual_end DATETIME(3),
  status ENUM('PLANNED','ACTIVE','CLOSED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_shift_id_event (id,event_id),
  KEY ix_shift_salesperson_date (salesperson_id,business_date),
  CONSTRAINT fk_shift_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT fk_shift_booth_event FOREIGN KEY (booth_id,event_id) REFERENCES booths(id,event_id),
  CONSTRAINT ck_shift_times CHECK (planned_end > planned_start)
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('OWNER','SALESPERSON') NOT NULL,
  salesperson_id BIGINT UNSIGNED UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT ck_user_salesperson_role CHECK ((role='OWNER' AND salesperson_id IS NULL) OR (role='SALESPERSON' AND salesperson_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  csrf_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3),
  KEY ix_sessions_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE sales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sale_no VARCHAR(40) UNIQUE,
  shift_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  state ENUM('DRAFT','CHECKOUT','POSTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  prepared_at DATETIME(3),
  posted_at DATETIME(3),
  created_by BIGINT UNSIGNED NOT NULL,
  posted_by BIGINT UNSIGNED,
  payment_method ENUM('CASH','TERMINAL'),
  payment_reference VARCHAR(120),
  cash_received_cents BIGINT UNSIGNED,
  net_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tax_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  KEY ix_sales_event_posted (event_id,posted_at),
  KEY ix_sales_shift_posted (shift_id,posted_at),
  CONSTRAINT fk_sale_shift_event FOREIGN KEY (shift_id,event_id) REFERENCES shifts(id,event_id),
  CONSTRAINT fk_sale_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_sale_poster FOREIGN KEY (posted_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE sale_lines (
  sale_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  final_unit_price_cents BIGINT UNSIGNED NOT NULL,
  line_net_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  line_tax_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  line_commission_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cost_snapshot_cents BIGINT UNSIGNED,
  min_snapshot_cents BIGINT UNSIGNED,
  tax_bps_snapshot SMALLINT UNSIGNED,
  commission_bps_snapshot SMALLINT UNSIGNED,
  name_snapshot VARCHAR(160),
  sku_snapshot VARCHAR(64),
  PRIMARY KEY (sale_id,line_no),
  KEY ix_sale_line_product (product_id,sale_id),
  CONSTRAINT fk_line_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_line_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_line_qty CHECK (quantity BETWEEN 1 AND 9999)
) ENGINE=InnoDB;

CREATE TABLE stock_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  kind ENUM('WAREHOUSE','BOOTH') NOT NULL,
  booth_id BIGINT UNSIGNED UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_location_booth FOREIGN KEY (booth_id) REFERENCES booths(id),
  CONSTRAINT ck_location_kind CHECK ((kind='WAREHOUSE' AND booth_id IS NULL) OR (kind='BOOTH' AND booth_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE stock_balances (
  location_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  on_hand BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reserved BIGINT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (location_id,product_id),
  CONSTRAINT fk_balance_location FOREIGN KEY (location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_balance_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_balance_reserved CHECK (on_hand >= reserved)
) ENGINE=InnoDB;

CREATE TABLE stock_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('RECEIVE','TRANSFER','ADJUST','RETURN') NOT NULL,
  from_location_id BIGINT UNSIGNED,
  to_location_id BIGINT UNSIGNED,
  reason VARCHAR(500) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_doc_from FOREIGN KEY (from_location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_doc_to FOREIGN KEY (to_location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_doc_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE stock_document_lines (
  document_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (document_id,line_no),
  CONSTRAINT fk_docline_doc FOREIGN KEY (document_id) REFERENCES stock_documents(id),
  CONSTRAINT fk_docline_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_docline_nonzero CHECK (quantity <> 0)
) ENGINE=InnoDB;

CREATE TABLE stock_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  location_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  delta BIGINT NOT NULL,
  source_kind ENUM('DOCUMENT','SALE','RETURN') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  source_line_no SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_stock_source (source_kind,source_id,source_line_no,location_id),
  KEY ix_ledger_location_product (location_id,product_id),
  CONSTRAINT fk_ledger_location FOREIGN KEY (location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_ledger_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_ledger_nonzero CHECK (delta <> 0)
) ENGINE=InnoDB;

CREATE TABLE stock_holds (
  sale_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','CONSUMED','RELEASED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (sale_id,line_no),
  CONSTRAINT fk_hold_line FOREIGN KEY (sale_id,line_no) REFERENCES sale_lines(sale_id,line_no),
  CONSTRAINT fk_hold_location FOREIGN KEY (location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_hold_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT UNSIGNED NOT NULL,
  state ENUM('DRAFT','AUTHORIZED','POSTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  reason VARCHAR(500) NOT NULL,
  refund_reference VARCHAR(120),
  destination_location_id BIGINT UNSIGNED,
  created_by BIGINT UNSIGNED NOT NULL,
  authorized_at DATETIME(3),
  posted_at DATETIME(3),
  net_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tax_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_returns_sale (sale_id),
  CONSTRAINT fk_return_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_return_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_return_location FOREIGN KEY (destination_location_id) REFERENCES stock_locations(id)
) ENGINE=InnoDB;

CREATE TABLE return_lines (
  return_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  sale_line_no SMALLINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  disposition ENUM('RESTOCK','DAMAGED') NOT NULL,
  net_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tax_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  commission_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (return_id,line_no),
  UNIQUE KEY uq_return_orig_line (return_id,sale_line_no),
  CONSTRAINT fk_returnline_return FOREIGN KEY (return_id) REFERENCES returns(id),
  CONSTRAINT ck_returnline_qty CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE commission_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  salesperson_id BIGINT UNSIGNED NOT NULL,
  amount_cents BIGINT NOT NULL,
  source_kind ENUM('SALE','RETURN') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  source_line_no SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_commission_source (source_kind,source_id,source_line_no),
  KEY ix_commission_salesperson_date (salesperson_id,created_at),
  CONSTRAINT fk_commission_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT ck_commission_nonzero CHECK (amount_cents <> 0)
) ENGINE=InnoDB;

CREATE TABLE commission_settlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  salesperson_id BIGINT UNSIGNED NOT NULL,
  state ENUM('PREPARED','PAID','CANCELLED') NOT NULL DEFAULT 'PREPARED',
  cutoff_at DATETIME(3) NOT NULL,
  total_cents BIGINT NOT NULL,
  payment_reference VARCHAR(120),
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at DATETIME(3),
  CONSTRAINT fk_settlement_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT fk_settlement_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT ck_settlement_positive CHECK (total_cents > 0)
) ENGINE=InnoDB;

CREATE TABLE commission_settlement_lines (
  settlement_id BIGINT UNSIGNED NOT NULL,
  entry_id BIGINT UNSIGNED NOT NULL,
  amount_cents BIGINT NOT NULL,
  PRIMARY KEY (settlement_id,entry_id),
  CONSTRAINT fk_settlementline_settlement FOREIGN KEY (settlement_id) REFERENCES commission_settlements(id),
  CONSTRAINT fk_settlementline_entry FOREIGN KEY (entry_id) REFERENCES commission_entries(id)
) ENGINE=InnoDB;

CREATE TABLE commission_claims (
  entry_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  settlement_id BIGINT UNSIGNED NOT NULL,
  CONSTRAINT fk_claim_entry FOREIGN KEY (entry_id) REFERENCES commission_entries(id),
  CONSTRAINT fk_claim_settlement FOREIGN KEY (settlement_id) REFERENCES commission_settlements(id)
) ENGINE=InnoDB;

CREATE TABLE idempotency_keys (
  actor_id BIGINT UNSIGNED NOT NULL,
  operation VARCHAR(80) NOT NULL,
  command_key CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (actor_id,operation,command_key),
  CONSTRAINT fk_idempotency_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED,
  action VARCHAR(100) NOT NULL,
  subject_type VARCHAR(60) NOT NULL,
  subject_id BIGINT UNSIGNED,
  detail_json LONGTEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_date (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO event_categories (code,type) VALUES
('trade_show','trade show'),('rib_fest','rib fest'),('waterfront_festival','waterfront festival'),
('music_festival','music festival'),('beer_festival','beer festival'),
('sporting_event','sporting event'),('street_festival','street festival');
INSERT INTO stock_locations (code,name,kind) VALUES ('MAIN','主仓','WAREHOUSE');
