-- Additive upgrade. Existing documents retain CAD / exclusive / Toronto snapshots.
ALTER TABLE events ADD currency CHAR(3) NOT NULL DEFAULT 'CAD', ADD business_timezone VARCHAR(64) NOT NULL DEFAULT 'America/Toronto', ADD price_basis ENUM('EXCLUSIVE','INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE', ADD return_days SMALLINT UNSIGNED NULL;
ALTER TABLE sales ADD currency CHAR(3) NOT NULL DEFAULT 'CAD', ADD price_basis ENUM('EXCLUSIVE','INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE', ADD return_days SMALLINT UNSIGNED NULL, MODIFY payment_method ENUM('CASH','TERMINAL','EXCHANGE') NULL, ADD exchange_id BIGINT UNSIGNED NULL;
ALTER TABLE shifts ADD opening_cash_cents BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE products ADD currency CHAR(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE commission_entries ADD currency CHAR(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE commission_settlements ADD currency CHAR(3) NOT NULL DEFAULT 'CAD';
ALTER TABLE returns ADD cash_shift_id BIGINT UNSIGNED NULL, ADD exchange_id BIGINT UNSIGNED NULL, ADD CONSTRAINT fk_return_cash_shift FOREIGN KEY(cash_shift_id) REFERENCES shifts(id);
ALTER TABLE stock_locations DROP CONSTRAINT ck_location_kind, MODIFY kind ENUM('WAREHOUSE','BOOTH','TRANSIT','DAMAGED') NOT NULL, ADD CONSTRAINT ck_location_kind CHECK ((kind='BOOTH' AND booth_id IS NOT NULL) OR (kind<>'BOOTH' AND booth_id IS NULL));
ALTER TABLE stock_documents MODIFY kind ENUM('RECEIVE','TRANSFER','ADJUST','RETURN','DISPATCH','ACCEPT','RECALL','DAMAGE','REPAIR','DISPOSE') NOT NULL;
INSERT INTO stock_locations(code,name,kind) VALUES('DAMAGED','损坏品隔离库','DAMAGED');

CREATE TABLE business_settings (
 id TINYINT UNSIGNED PRIMARY KEY,
 currency CHAR(3) NOT NULL,
 business_timezone VARCHAR(64) NOT NULL,
 price_basis ENUM('EXCLUSIVE','INCLUSIVE') NOT NULL,
 return_days SMALLINT UNSIGNED NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB;
INSERT INTO business_settings(id,currency,business_timezone,price_basis,return_days) VALUES(1,'CNY','Asia/Shanghai','INCLUSIVE',7);

CREATE TABLE stock_transfers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 product_id BIGINT UNSIGNED NOT NULL,
 from_location_id BIGINT UNSIGNED NOT NULL,
 to_location_id BIGINT UNSIGNED NOT NULL,
 transit_location_id BIGINT UNSIGNED NOT NULL,
 quantity INT UNSIGNED NOT NULL,
 state ENUM('DISPATCHED','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DISPATCHED',
 received_quantity INT UNSIGNED NULL,
 damaged_quantity INT UNSIGNED NULL,
 missing_quantity INT UNSIGNED NULL,
 reason VARCHAR(500) NOT NULL,
 receiving_note VARCHAR(500) NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 received_by BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 received_at DATETIME(3) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 CONSTRAINT fk_transfer_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_transfer_from FOREIGN KEY(from_location_id) REFERENCES stock_locations(id),
 CONSTRAINT fk_transfer_to FOREIGN KEY(to_location_id) REFERENCES stock_locations(id),
 CONSTRAINT fk_transfer_transit FOREIGN KEY(transit_location_id) REFERENCES stock_locations(id),
 CONSTRAINT fk_transfer_creator FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT fk_transfer_receiver FOREIGN KEY(received_by) REFERENCES users(id),
 CONSTRAINT ck_transfer_qty CHECK(quantity>0),
 CONSTRAINT ck_transfer_received CHECK(state<>'RECEIVED' OR received_quantity+damaged_quantity+missing_quantity=quantity)
) ENGINE=InnoDB;

CREATE TABLE damage_records (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 product_id BIGINT UNSIGNED NOT NULL,
 quantity INT UNSIGNED NOT NULL,
 repaired_quantity INT UNSIGNED NOT NULL DEFAULT 0,
 disposed_quantity INT UNSIGNED NOT NULL DEFAULT 0,
 reason VARCHAR(500) NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 version INT UNSIGNED NOT NULL DEFAULT 1,
 CONSTRAINT fk_damage_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_damage_creator FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT ck_damage_remaining CHECK(repaired_quantity+disposed_quantity<=quantity)
) ENGINE=InnoDB;

CREATE TABLE cash_handovers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 shift_id BIGINT UNSIGNED NOT NULL UNIQUE,
 expected_cents BIGINT NOT NULL,
 actual_cents BIGINT UNSIGNED NOT NULL,
 difference_cents BIGINT NOT NULL,
 reason VARCHAR(500) NOT NULL,
 state ENUM('SUBMITTED','VERIFIED','RETURNED') NOT NULL DEFAULT 'SUBMITTED',
 submitted_by BIGINT UNSIGNED NOT NULL,
 reviewed_by BIGINT UNSIGNED NULL,
 review_note VARCHAR(500) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 reviewed_at DATETIME(3) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 CONSTRAINT fk_cash_shift FOREIGN KEY(shift_id) REFERENCES shifts(id),
 CONSTRAINT fk_cash_submitter FOREIGN KEY(submitted_by) REFERENCES users(id),
 CONSTRAINT fk_cash_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id),
 CONSTRAINT ck_cash_difference CHECK(difference_cents=CAST(actual_cents AS SIGNED)-expected_cents)
) ENGINE=InnoDB;

CREATE TABLE shift_extensions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 shift_id BIGINT UNSIGNED NOT NULL,
 proposed_end DATETIME(3) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 state ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
 requested_by BIGINT UNSIGNED NOT NULL,
 reviewed_by BIGINT UNSIGNED NULL,
 review_note VARCHAR(500) NULL,
 base_version INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 reviewed_at DATETIME(3) NULL,
 CONSTRAINT fk_extension_shift FOREIGN KEY(shift_id) REFERENCES shifts(id),
 CONSTRAINT fk_extension_requester FOREIGN KEY(requested_by) REFERENCES users(id),
 CONSTRAINT fk_extension_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE sale_workspaces (
 owner_id BIGINT UNSIGNED NOT NULL,
 workspace_key VARCHAR(80) NOT NULL,
 payload_json LONGTEXT NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(owner_id,workspace_key),
 CONSTRAINT fk_workspace_owner FOREIGN KEY(owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE exchanges (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 original_sale_id BIGINT UNSIGNED NOT NULL,
 return_id BIGINT UNSIGNED NULL UNIQUE,
 new_sale_id BIGINT UNSIGNED NULL UNIQUE,
 state ENUM('PREPARED','POSTED','CANCELLED') NOT NULL DEFAULT 'PREPARED',
 currency CHAR(3) NOT NULL,
 difference_cents BIGINT NOT NULL DEFAULT 0,
 payment_method ENUM('CASH','TERMINAL') NULL,
 payment_reference VARCHAR(120) NULL,
 cash_received_cents BIGINT UNSIGNED NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 posted_at DATETIME(3) NULL,
 CONSTRAINT fk_exchange_original FOREIGN KEY(original_sale_id) REFERENCES sales(id),
 CONSTRAINT fk_exchange_return FOREIGN KEY(return_id) REFERENCES returns(id),
 CONSTRAINT fk_exchange_new FOREIGN KEY(new_sale_id) REFERENCES sales(id),
 CONSTRAINT fk_exchange_creator FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;
ALTER TABLE sales ADD CONSTRAINT fk_sale_exchange FOREIGN KEY(exchange_id) REFERENCES exchanges(id);
ALTER TABLE returns ADD CONSTRAINT fk_return_exchange FOREIGN KEY(exchange_id) REFERENCES exchanges(id);
CREATE INDEX ix_returns_cash_shift ON returns(cash_shift_id,state);
CREATE INDEX ix_transfers_state ON stock_transfers(state,id);
CREATE INDEX ix_extension_pending ON shift_extensions(shift_id,state);
CREATE INDEX ix_cash_handover_state ON cash_handovers(state,id);
CREATE INDEX ix_exchanges_state ON exchanges(state,id);
