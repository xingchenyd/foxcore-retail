CREATE TABLE event_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  type VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE venues (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  street VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  province VARCHAR(80) NOT NULL,
  postal_code VARCHAR(16) NOT NULL,
  description VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1
);

CREATE TABLE events (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  venue_id BIGINT CHECK (venue_id >= 0) NOT NULL,
  category_id BIGINT CHECK (category_id >= 0) NOT NULL,
  name VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description VARCHAR(500),
  status VARCHAR(32) CONSTRAINT status_allowed CHECK (status IN ('DRAFT','OPEN','CLOSED','CANCELLED')) NOT NULL DEFAULT 'DRAFT',
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Toronto',
  tax_bps INTEGER CHECK (tax_bps >= 0 AND tax_bps <= 65535),
  policy_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
  CONSTRAINT fk_events_venue FOREIGN KEY (venue_id) REFERENCES venues(id),
  CONSTRAINT fk_events_category FOREIGN KEY (category_id) REFERENCES event_categories(id),
  CONSTRAINT ck_event_dates CHECK (end_date >= start_date),
  CONSTRAINT ck_event_tax CHECK (tax_bps IS NULL OR tax_bps <= 10000)
);

CREATE TABLE booths (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  event_id BIGINT CHECK (event_id >= 0) NOT NULL,
  location VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_booth_id_event UNIQUE (id,event_id),
  CONSTRAINT fk_booths_event FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  wholesale_cost_cents BIGINT CHECK (wholesale_cost_cents >= 0) NOT NULL,
  min_price_cents BIGINT CHECK (min_price_cents >= 0) NOT NULL,
  suggested_price_cents BIGINT CHECK (suggested_price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
  CONSTRAINT ck_product_prices CHECK (suggested_price_cents IS NULL OR suggested_price_cents >= min_price_cents)
);

CREATE TABLE salespeople (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  street VARCHAR(120),
  city VARCHAR(80),
  province VARCHAR(80),
  postal_code VARCHAR(16),
  phone VARCHAR(32),
  description VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  commission_bps INTEGER CHECK (commission_bps >= 0 AND commission_bps <= 65535),
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
  CONSTRAINT ck_commission_rate CHECK (commission_bps IS NULL OR commission_bps <= 10000)
);

CREATE TABLE shifts (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  salesperson_id BIGINT CHECK (salesperson_id >= 0) NOT NULL,
  booth_id BIGINT CHECK (booth_id >= 0) NOT NULL,
  event_id BIGINT CHECK (event_id >= 0) NOT NULL,
  business_date DATE NOT NULL,
  planned_start TIMESTAMP(3) NOT NULL,
  planned_end TIMESTAMP(3) NOT NULL,
  actual_start TIMESTAMP(3),
  actual_end TIMESTAMP(3),
  status VARCHAR(32) CONSTRAINT status_allowed CHECK (status IN ('PLANNED','ACTIVE','CLOSED','CANCELLED')) NOT NULL DEFAULT 'PLANNED',
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
  CONSTRAINT uq_shift_id_event UNIQUE (id,event_id),
  CONSTRAINT fk_shift_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT fk_shift_booth_event FOREIGN KEY (booth_id,event_id) REFERENCES booths(id,event_id),
  CONSTRAINT ck_shift_times CHECK (planned_end > planned_start)
);
CREATE INDEX ix_shift_salesperson_date ON shifts(salesperson_id,business_date);

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) CONSTRAINT role_allowed CHECK (role IN ('OWNER','SALESPERSON')) NOT NULL,
  salesperson_id BIGINT CHECK (salesperson_id >= 0) UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins INTEGER CHECK (failed_logins >= 0) NOT NULL DEFAULT 0,
  locked_until TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT fk_user_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT ck_user_salesperson_role CHECK ((role='OWNER' AND salesperson_id IS NULL) OR (role='SALESPERSON' AND salesperson_id IS NOT NULL))
);

CREATE TABLE sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  user_id BIGINT CHECK (user_id >= 0) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  csrf_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX ix_sessions_user ON sessions(user_id);

CREATE TABLE sales (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  sale_no VARCHAR(40) UNIQUE,
  shift_id BIGINT CHECK (shift_id >= 0) NOT NULL,
  event_id BIGINT CHECK (event_id >= 0) NOT NULL,
  state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('DRAFT','CHECKOUT','POSTED','CANCELLED')) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  prepared_at TIMESTAMP(3),
  posted_at TIMESTAMP(3),
  created_by BIGINT CHECK (created_by >= 0) NOT NULL,
  posted_by BIGINT CHECK (posted_by >= 0),
  payment_method VARCHAR(32) CONSTRAINT payment_method_allowed CHECK (payment_method IN ('CASH','TERMINAL')),
  payment_reference VARCHAR(120),
  cash_received_cents BIGINT CHECK (cash_received_cents >= 0),
  net_cents BIGINT CHECK (net_cents >= 0) NOT NULL DEFAULT 0,
  tax_cents BIGINT CHECK (tax_cents >= 0) NOT NULL DEFAULT 0,
  total_cents BIGINT CHECK (total_cents >= 0) NOT NULL DEFAULT 0,
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
  CONSTRAINT fk_sale_shift_event FOREIGN KEY (shift_id,event_id) REFERENCES shifts(id,event_id),
  CONSTRAINT fk_sale_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_sale_poster FOREIGN KEY (posted_by) REFERENCES users(id)
);
CREATE INDEX ix_sales_event_posted ON sales(event_id,posted_at);
CREATE INDEX ix_sales_shift_posted ON sales(shift_id,posted_at);

CREATE TABLE sale_lines (
  sale_id BIGINT CHECK (sale_id >= 0) NOT NULL,
  line_no INTEGER CHECK (line_no >= 0 AND line_no <= 65535) NOT NULL,
  product_id BIGINT CHECK (product_id >= 0) NOT NULL,
  quantity INTEGER CHECK (quantity >= 0) NOT NULL,
  final_unit_price_cents BIGINT CHECK (final_unit_price_cents >= 0) NOT NULL,
  line_net_cents BIGINT CHECK (line_net_cents >= 0) NOT NULL DEFAULT 0,
  line_tax_cents BIGINT CHECK (line_tax_cents >= 0) NOT NULL DEFAULT 0,
  line_commission_cents BIGINT CHECK (line_commission_cents >= 0) NOT NULL DEFAULT 0,
  cost_snapshot_cents BIGINT CHECK (cost_snapshot_cents >= 0),
  min_snapshot_cents BIGINT CHECK (min_snapshot_cents >= 0),
  tax_bps_snapshot INTEGER CHECK (tax_bps_snapshot >= 0 AND tax_bps_snapshot <= 65535),
  commission_bps_snapshot INTEGER CHECK (commission_bps_snapshot >= 0 AND commission_bps_snapshot <= 65535),
  name_snapshot VARCHAR(160),
  sku_snapshot VARCHAR(64),
  PRIMARY KEY (sale_id,line_no),
  CONSTRAINT fk_line_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_line_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_line_qty CHECK (quantity BETWEEN 1 AND 9999)
);
CREATE INDEX ix_sale_line_product ON sale_lines(product_id,sale_id);

CREATE TABLE stock_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  kind VARCHAR(32) CONSTRAINT kind_allowed CHECK (kind IN ('WAREHOUSE','BOOTH')) NOT NULL,
  booth_id BIGINT CHECK (booth_id >= 0) UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_location_booth FOREIGN KEY (booth_id) REFERENCES booths(id),
  CONSTRAINT ck_location_kind CHECK ((kind='WAREHOUSE' AND booth_id IS NULL) OR (kind='BOOTH' AND booth_id IS NOT NULL))
);

CREATE TABLE stock_balances (
  location_id BIGINT CHECK (location_id >= 0) NOT NULL,
  product_id BIGINT CHECK (product_id >= 0) NOT NULL,
  on_hand BIGINT CHECK (on_hand >= 0) NOT NULL DEFAULT 0,
  reserved BIGINT CHECK (reserved >= 0) NOT NULL DEFAULT 0,
  version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
  PRIMARY KEY (location_id,product_id),
  CONSTRAINT fk_balance_location FOREIGN KEY (location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_balance_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_balance_reserved CHECK (on_hand >= reserved)
);

CREATE TABLE stock_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  kind VARCHAR(32) CONSTRAINT kind_allowed CHECK (kind IN ('RECEIVE','TRANSFER','ADJUST','RETURN')) NOT NULL,
  from_location_id BIGINT CHECK (from_location_id >= 0),
  to_location_id BIGINT CHECK (to_location_id >= 0),
  reason VARCHAR(500) NOT NULL,
  created_by BIGINT CHECK (created_by >= 0) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT fk_doc_from FOREIGN KEY (from_location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_doc_to FOREIGN KEY (to_location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_doc_user FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE stock_document_lines (
  document_id BIGINT CHECK (document_id >= 0) NOT NULL,
  line_no INTEGER CHECK (line_no >= 0 AND line_no <= 65535) NOT NULL,
  product_id BIGINT CHECK (product_id >= 0) NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (document_id,line_no),
  CONSTRAINT fk_docline_doc FOREIGN KEY (document_id) REFERENCES stock_documents(id),
  CONSTRAINT fk_docline_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_docline_nonzero CHECK (quantity <> 0)
);

CREATE TABLE stock_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  location_id BIGINT CHECK (location_id >= 0) NOT NULL,
  product_id BIGINT CHECK (product_id >= 0) NOT NULL,
  delta BIGINT NOT NULL,
  source_kind VARCHAR(32) CONSTRAINT source_kind_allowed CHECK (source_kind IN ('DOCUMENT','SALE','RETURN')) NOT NULL,
  source_id BIGINT CHECK (source_id >= 0) NOT NULL,
  source_line_no INTEGER CHECK (source_line_no >= 0 AND source_line_no <= 65535) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT uq_stock_source UNIQUE (source_kind,source_id,source_line_no,location_id),
  CONSTRAINT fk_ledger_location FOREIGN KEY (location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_ledger_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT ck_ledger_nonzero CHECK (delta <> 0)
);
CREATE INDEX ix_ledger_location_product ON stock_ledger(location_id,product_id);

CREATE TABLE stock_holds (
  sale_id BIGINT CHECK (sale_id >= 0) NOT NULL,
  line_no INTEGER CHECK (line_no >= 0 AND line_no <= 65535) NOT NULL,
  location_id BIGINT CHECK (location_id >= 0) NOT NULL,
  product_id BIGINT CHECK (product_id >= 0) NOT NULL,
  quantity INTEGER CHECK (quantity >= 0) NOT NULL,
  status VARCHAR(32) CONSTRAINT status_allowed CHECK (status IN ('ACTIVE','CONSUMED','RELEASED')) NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (sale_id,line_no),
  CONSTRAINT fk_hold_line FOREIGN KEY (sale_id,line_no) REFERENCES sale_lines(sale_id,line_no),
  CONSTRAINT fk_hold_location FOREIGN KEY (location_id) REFERENCES stock_locations(id),
  CONSTRAINT fk_hold_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE returns (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  sale_id BIGINT CHECK (sale_id >= 0) NOT NULL,
  state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('DRAFT','AUTHORIZED','POSTED','CANCELLED')) NOT NULL DEFAULT 'DRAFT',
  reason VARCHAR(500) NOT NULL,
  refund_reference VARCHAR(120),
  destination_location_id BIGINT CHECK (destination_location_id >= 0),
  created_by BIGINT CHECK (created_by >= 0) NOT NULL,
  authorized_at TIMESTAMP(3),
  posted_at TIMESTAMP(3),
  net_cents BIGINT CHECK (net_cents >= 0) NOT NULL DEFAULT 0,
  tax_cents BIGINT CHECK (tax_cents >= 0) NOT NULL DEFAULT 0,
  total_cents BIGINT CHECK (total_cents >= 0) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT fk_return_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_return_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_return_location FOREIGN KEY (destination_location_id) REFERENCES stock_locations(id)
);
CREATE INDEX ix_returns_sale ON returns(sale_id);

CREATE TABLE return_lines (
  return_id BIGINT CHECK (return_id >= 0) NOT NULL,
  line_no INTEGER CHECK (line_no >= 0 AND line_no <= 65535) NOT NULL,
  sale_line_no INTEGER CHECK (sale_line_no >= 0 AND sale_line_no <= 65535) NOT NULL,
  quantity INTEGER CHECK (quantity >= 0) NOT NULL,
  disposition VARCHAR(32) CONSTRAINT disposition_allowed CHECK (disposition IN ('RESTOCK','DAMAGED')) NOT NULL,
  net_cents BIGINT CHECK (net_cents >= 0) NOT NULL DEFAULT 0,
  tax_cents BIGINT CHECK (tax_cents >= 0) NOT NULL DEFAULT 0,
  commission_cents BIGINT CHECK (commission_cents >= 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (return_id,line_no),
  CONSTRAINT uq_return_orig_line UNIQUE (return_id,sale_line_no),
  CONSTRAINT fk_returnline_return FOREIGN KEY (return_id) REFERENCES returns(id),
  CONSTRAINT ck_returnline_qty CHECK (quantity > 0)
);

CREATE TABLE commission_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  salesperson_id BIGINT CHECK (salesperson_id >= 0) NOT NULL,
  amount_cents BIGINT NOT NULL,
  source_kind VARCHAR(32) CONSTRAINT source_kind_allowed CHECK (source_kind IN ('SALE','RETURN')) NOT NULL,
  source_id BIGINT CHECK (source_id >= 0) NOT NULL,
  source_line_no INTEGER CHECK (source_line_no >= 0 AND source_line_no <= 65535) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT uq_commission_source UNIQUE (source_kind,source_id,source_line_no),
  CONSTRAINT fk_commission_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT ck_commission_nonzero CHECK (amount_cents <> 0)
);
CREATE INDEX ix_commission_salesperson_date ON commission_entries(salesperson_id,created_at);

CREATE TABLE commission_settlements (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  salesperson_id BIGINT CHECK (salesperson_id >= 0) NOT NULL,
  state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('PREPARED','PAID','CANCELLED')) NOT NULL DEFAULT 'PREPARED',
  cutoff_at TIMESTAMP(3) NOT NULL,
  total_cents BIGINT NOT NULL,
  payment_reference VARCHAR(120),
  created_by BIGINT CHECK (created_by >= 0) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  paid_at TIMESTAMP(3),
  CONSTRAINT fk_settlement_salesperson FOREIGN KEY (salesperson_id) REFERENCES salespeople(id),
  CONSTRAINT fk_settlement_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT ck_settlement_positive CHECK (total_cents > 0)
);

CREATE TABLE commission_settlement_lines (
  settlement_id BIGINT CHECK (settlement_id >= 0) NOT NULL,
  entry_id BIGINT CHECK (entry_id >= 0) NOT NULL,
  amount_cents BIGINT NOT NULL,
  PRIMARY KEY (settlement_id,entry_id),
  CONSTRAINT fk_settlementline_settlement FOREIGN KEY (settlement_id) REFERENCES commission_settlements(id),
  CONSTRAINT fk_settlementline_entry FOREIGN KEY (entry_id) REFERENCES commission_entries(id)
);

CREATE TABLE commission_claims (
  entry_id BIGINT CHECK (entry_id >= 0) NOT NULL PRIMARY KEY,
  settlement_id BIGINT CHECK (settlement_id >= 0) NOT NULL,
  CONSTRAINT fk_claim_entry FOREIGN KEY (entry_id) REFERENCES commission_entries(id),
  CONSTRAINT fk_claim_settlement FOREIGN KEY (settlement_id) REFERENCES commission_settlements(id)
);

CREATE TABLE idempotency_keys (
  actor_id BIGINT CHECK (actor_id >= 0) NOT NULL,
  operation VARCHAR(80) NOT NULL,
  command_key CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_json TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  PRIMARY KEY (actor_id,operation,command_key),
  CONSTRAINT fk_idempotency_actor FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
  actor_id BIGINT CHECK (actor_id >= 0),
  action VARCHAR(100) NOT NULL,
  subject_type VARCHAR(60) NOT NULL,
  subject_id BIGINT CHECK (subject_id >= 0),
  detail_json TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
);
CREATE INDEX ix_audit_date ON audit_events(created_at);

INSERT INTO event_categories (code,type) VALUES
('trade_show','trade show'),('rib_fest','rib fest'),('waterfront_festival','waterfront festival'),
('music_festival','music festival'),('beer_festival','beer festival'),
('sporting_event','sporting event'),('street_festival','street festival');
INSERT INTO stock_locations (code,name,kind) VALUES ('MAIN','主仓','WAREHOUSE');

CREATE UNIQUE INDEX uq_users_username_ci ON users(lower(username));
CREATE UNIQUE INDEX uq_products_sku_ci ON products(lower(sku));
CREATE UNIQUE INDEX uq_booth_event_location ON booths(event_id,lower(location));
