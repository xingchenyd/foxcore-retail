ALTER TABLE stock_transfers DROP CONSTRAINT ck_transfer_received,
 ADD CONSTRAINT ck_transfer_received_complete CHECK(state<>'RECEIVED' OR (received_quantity IS NOT NULL AND damaged_quantity IS NOT NULL AND missing_quantity IS NOT NULL AND received_quantity+damaged_quantity+missing_quantity=quantity));
CREATE TABLE sale_workspace_revisions (
 owner_id BIGINT CHECK (owner_id >= 0) NOT NULL,
 workspace_key VARCHAR(80) NOT NULL,
 revision INTEGER CHECK (revision >= 0) NOT NULL,
 payload_json TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 PRIMARY KEY(owner_id,workspace_key,revision),
 CONSTRAINT fk_workspace_revision FOREIGN KEY(owner_id,workspace_key) REFERENCES sale_workspaces(owner_id,workspace_key)
);
INSERT INTO sale_workspace_revisions(owner_id,workspace_key,revision,payload_json) SELECT owner_id,workspace_key,revision,payload_json FROM sale_workspaces;
CREATE INDEX ix_sales_state_id ON sales(state,id);
CREATE INDEX ix_sales_currency_event ON sales(currency,event_id,posted_at);
CREATE INDEX ix_commission_person_currency ON commission_entries(salesperson_id,currency,id);
CREATE INDEX ix_shifts_status_owner ON shifts(status,salesperson_id,id);
