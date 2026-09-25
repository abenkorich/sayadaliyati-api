BEGIN;
ALTER TABLE medicines
  ALTER COLUMN strength TYPE TEXT,
  ALTER COLUMN package_size TYPE TEXT,
  ADD COLUMN regulatory_status VARCHAR(30),
  ADD COLUMN registration_holder TEXT,
  ADD COLUMN holder_country TEXT,
  ADD COLUMN source_checksum VARCHAR(64),
  ADD COLUMN source_metadata JSONB,
  ADD CONSTRAINT medicines_regulatory_status_valid CHECK (
    regulatory_status IS NULL OR regulatory_status IN ('CURRENT', 'NOT_RENEWED', 'WITHDRAWN')),
  ADD CONSTRAINT medicines_regulatory_inactive CHECK (
    regulatory_status NOT IN ('NOT_RENEWED', 'WITHDRAWN') OR status <> 'ACTIVE');

-- Ambiguous registrations are quarantined rather than assigned arbitrary identities.
CREATE UNIQUE INDEX medicines_miph_registration_unique ON medicines (registration_number)
  WHERE source = 'MIPH';

CREATE TABLE medicine_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(150) NOT NULL,
  source_version VARCHAR(100) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  source_url TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
COMMIT;
