CREATE TABLE admin_transfer_receipts (
 id varchar(64) PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 dataset varchar(20) NOT NULL CHECK (dataset IN ('users','medicines','doctors','pharmacies','hospitals','settings')),
 count integer NOT NULL CHECK (count >= 0),
 created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX admin_transfer_receipts_actor_id_created_at_idx ON admin_transfer_receipts(actor_id,created_at);
