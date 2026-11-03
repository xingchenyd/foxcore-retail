-- Additive upgrade. Existing documents retain CAD / exclusive / Toronto snapshots.
ALTER TABLE events ADD currency CHAR(3) NOT NULL DEFAULT 'CAD', ADD business_timezone VARCHAR(64) NOT NULL DEFAULT 'America/Toronto', ADD price_basis VARCHAR(32) CONSTRAINT price_basis_allowed CHECK (price_basis IN ('EXCLUSIVE','INCLUSIVE')) NOT NULL DEFAULT 'EXCLUSIVE', ADD return_days INTEGER CHECK (return_days >= 0 AND return_days <= 65535) NULL;
ALTER TABLE sales ADD currency CHAR(3) NOT NULL DEFAULT 'CAD', ADD price_basis VARCHAR(32) CONSTRAINT price_basis_allowed CHECK (price_basis IN ('EXCLUSIVE','INCLUSIVE')) NOT NULL DEFAULT 'EXCLUSIVE', ADD return_days INTEGER CHECK (return_days >= 0 AND return_days <= 65535) NULL, DROP CONSTRAINT payment_method_allowed, ADD CONSTRAINT payment_method_allowed CHECK (payment_method IN ('CASH','TERMINAL','EXCHANGE')), ADD exchange_id BIGINT CHECK (exchange_id >= 0) NULL;
ALTER TABLE shifts ADD opening_cash_cents BIGINT CHECK (opening_cash_cents >= 0) NOT NULL DEFAULT 0;
ALTER TABLE products ADD currency CHAR(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE commission_entries ADD currency CHAR(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE commission_settlements ADD currency CHAR(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE returns ADD cash_shift_id BIGINT CHECK (cash_shift_id >= 0) NULL, ADD exchange_id BIGINT CHECK (exchange_id >= 0) NULL, ADD CONSTRAINT fk_return_cash_shift FOREIGN KEY(cash_shift_id) REFERENCES shifts(id);
ALTER TABLE stock_locations DROP CONSTRAINT ck_location_kind, DROP CONSTRAINT kind_allowed, ADD CONSTRAINT kind_allowed CHECK (kind IN ('WAREHOUSE','BOOTH','TRANSIT','DAMAGED')), ADD CONSTRAINT ck_location_kind CHECK ((kind='BOOTH' AND booth_id IS NOT NULL) OR (kind<>'BOOTH' AND booth_id IS NULL));
ALTER TABLE stock_documents DROP CONSTRAINT kind_allowed, ADD CONSTRAINT kind_allowed CHECK (kind IN ('RECEIVE','TRANSFER','ADJUST','RETURN','DISPATCH','ACCEPT','RECALL','DAMAGE','REPAIR','DISPOSE'));
INSERT INTO stock_locations(code,name,kind) VALUES('DAMAGED','损坏品隔离库','DAMAGED');

CREATE TABLE business_settings (
 id SMALLINT CHECK (id >= 0 AND id <= 255) PRIMARY KEY,
 currency CHAR(3) NOT NULL,
 business_timezone VARCHAR(64) NOT NULL,
 price_basis VARCHAR(32) CONSTRAINT price_basis_allowed CHECK (price_basis IN ('EXCLUSIVE','INCLUSIVE')) NOT NULL,
 return_days INTEGER CHECK (return_days >= 0 AND return_days <= 65535) NOT NULL,
 version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1
);
INSERT INTO business_settings(id,currency,business_timezone,price_basis,return_days) VALUES(1,'CNY','Asia/Shanghai','INCLUSIVE',7);

CREATE TABLE stock_transfers (
 id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
 product_id BIGINT CHECK (product_id >= 0) NOT NULL,
 from_location_id BIGINT CHECK (from_location_id >= 0) NOT NULL,
 to_location_id BIGINT CHECK (to_location_id >= 0) NOT NULL,
 transit_location_id BIGINT CHECK (transit_location_id >= 0) NOT NULL,
 quantity INTEGER CHECK (quantity >= 0) NOT NULL,
 state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('DISPATCHED','RECEIVED','CANCELLED')) NOT NULL DEFAULT 'DISPATCHED',
 received_quantity INTEGER CHECK (received_quantity >= 0) NULL,
 damaged_quantity INTEGER CHECK (damaged_quantity >= 0) NULL,
 missing_quantity INTEGER CHECK (missing_quantity >= 0) NULL,
 reason VARCHAR(500) NOT NULL,
 receiving_note VARCHAR(500) NULL,
 created_by BIGINT CHECK (created_by >= 0) NOT NULL,
 received_by BIGINT CHECK (received_by >= 0) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 received_at TIMESTAMP(3) NULL,
 version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
 CONSTRAINT fk_transfer_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_transfer_from FOREIGN KEY(from_location_id) REFERENCES stock_locations(id),
 CONSTRAINT fk_transfer_to FOREIGN KEY(to_location_id) REFERENCES stock_locations(id),
 CONSTRAINT fk_transfer_transit FOREIGN KEY(transit_location_id) REFERENCES stock_locations(id),
 CONSTRAINT fk_transfer_creator FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT fk_transfer_receiver FOREIGN KEY(received_by) REFERENCES users(id),
 CONSTRAINT ck_transfer_qty CHECK(quantity>0),
 CONSTRAINT ck_transfer_received CHECK(state<>'RECEIVED' OR received_quantity+damaged_quantity+missing_quantity=quantity)
);

CREATE TABLE damage_records (
 id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
 product_id BIGINT CHECK (product_id >= 0) NOT NULL,
 quantity INTEGER CHECK (quantity >= 0) NOT NULL,
 repaired_quantity INTEGER CHECK (repaired_quantity >= 0) NOT NULL DEFAULT 0,
 disposed_quantity INTEGER CHECK (disposed_quantity >= 0) NOT NULL DEFAULT 0,
 reason VARCHAR(500) NOT NULL,
 created_by BIGINT CHECK (created_by >= 0) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
 CONSTRAINT fk_damage_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_damage_creator FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT ck_damage_remaining CHECK(repaired_quantity+disposed_quantity<=quantity)
);

CREATE TABLE cash_handovers (
 id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
 shift_id BIGINT CHECK (shift_id >= 0) NOT NULL UNIQUE,
 expected_cents BIGINT NOT NULL,
 actual_cents BIGINT CHECK (actual_cents >= 0) NOT NULL,
 difference_cents BIGINT NOT NULL,
 reason VARCHAR(500) NOT NULL,
 state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('SUBMITTED','VERIFIED','RETURNED')) NOT NULL DEFAULT 'SUBMITTED',
 submitted_by BIGINT CHECK (submitted_by >= 0) NOT NULL,
 reviewed_by BIGINT CHECK (reviewed_by >= 0) NULL,
 review_note VARCHAR(500) NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 reviewed_at TIMESTAMP(3) NULL,
 version INTEGER CHECK (version >= 0) NOT NULL DEFAULT 1,
 CONSTRAINT fk_cash_shift FOREIGN KEY(shift_id) REFERENCES shifts(id),
 CONSTRAINT fk_cash_submitter FOREIGN KEY(submitted_by) REFERENCES users(id),
 CONSTRAINT fk_cash_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id),
 CONSTRAINT ck_cash_difference CHECK(difference_cents=CAST(actual_cents AS BIGINT)-expected_cents)
);

CREATE TABLE shift_extensions (
 id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
 shift_id BIGINT CHECK (shift_id >= 0) NOT NULL,
 proposed_end TIMESTAMP(3) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('PENDING','APPROVED','REJECTED')) NOT NULL DEFAULT 'PENDING',
 requested_by BIGINT CHECK (requested_by >= 0) NOT NULL,
 reviewed_by BIGINT CHECK (reviewed_by >= 0) NULL,
 review_note VARCHAR(500) NULL,
 base_version INTEGER CHECK (base_version >= 0) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 reviewed_at TIMESTAMP(3) NULL,
 CONSTRAINT fk_extension_shift FOREIGN KEY(shift_id) REFERENCES shifts(id),
 CONSTRAINT fk_extension_requester FOREIGN KEY(requested_by) REFERENCES users(id),
 CONSTRAINT fk_extension_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id)
);

CREATE TABLE sale_workspaces (
 owner_id BIGINT CHECK (owner_id >= 0) NOT NULL,
 workspace_key VARCHAR(80) NOT NULL,
 payload_json TEXT NOT NULL,
 revision INTEGER CHECK (revision >= 0) NOT NULL DEFAULT 1,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 PRIMARY KEY(owner_id,workspace_key),
 CONSTRAINT fk_workspace_owner FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE exchanges (
 id BIGINT GENERATED ALWAYS AS IDENTITY CHECK (id >= 0) PRIMARY KEY,
 original_sale_id BIGINT CHECK (original_sale_id >= 0) NOT NULL,
 return_id BIGINT CHECK (return_id >= 0) NULL UNIQUE,
 new_sale_id BIGINT CHECK (new_sale_id >= 0) NULL UNIQUE,
 state VARCHAR(32) CONSTRAINT state_allowed CHECK (state IN ('PREPARED','POSTED','CANCELLED')) NOT NULL DEFAULT 'PREPARED',
 currency CHAR(3) NOT NULL,
 difference_cents BIGINT NOT NULL DEFAULT 0,
 payment_method VARCHAR(32) CONSTRAINT payment_method_allowed CHECK (payment_method IN ('CASH','TERMINAL')) NULL,
 payment_reference VARCHAR(120) NULL,
 cash_received_cents BIGINT CHECK (cash_received_cents >= 0) NULL,
 created_by BIGINT CHECK (created_by >= 0) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 posted_at TIMESTAMP(3) NULL,
 CONSTRAINT fk_exchange_original FOREIGN KEY(original_sale_id) REFERENCES sales(id),
 CONSTRAINT fk_exchange_return FOREIGN KEY(return_id) REFERENCES returns(id),
 CONSTRAINT fk_exchange_new FOREIGN KEY(new_sale_id) REFERENCES sales(id),
 CONSTRAINT fk_exchange_creator FOREIGN KEY(created_by) REFERENCES users(id)
);
ALTER TABLE sales ADD CONSTRAINT fk_sale_exchange FOREIGN KEY(exchange_id) REFERENCES exchanges(id);
ALTER TABLE returns ADD CONSTRAINT fk_return_exchange FOREIGN KEY(exchange_id) REFERENCES exchanges(id);
CREATE INDEX ix_returns_cash_shift ON returns(cash_shift_id,state);
CREATE INDEX ix_transfers_state ON stock_transfers(state,id);
CREATE INDEX ix_extension_pending ON shift_extensions(shift_id,state);
CREATE INDEX ix_cash_handover_state ON cash_handovers(state,id);
CREATE INDEX ix_exchanges_state ON exchanges(state,id);
