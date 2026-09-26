-- Expand the existing runtime role for administrator-controlled catalog transfers.
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'saydaliyati_app') THEN
GRANT SELECT, INSERT ON medicine_categories, manufacturers, active_ingredients TO saydaliyati_app;
GRANT INSERT, UPDATE ON medicines TO saydaliyati_app;
GRANT INSERT, DELETE ON medicine_ingredients, medicine_barcodes, medicine_images TO saydaliyati_app;
 END IF;
END $$;
