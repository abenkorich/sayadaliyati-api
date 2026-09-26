-- Separate migration so installations that already applied scan_preferences
-- also receive the column-level runtime permission.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saydaliyati_app') THEN
    GRANT UPDATE (scan_processing_consent) ON patient_profiles TO saydaliyati_app;
  END IF;
END $$;
