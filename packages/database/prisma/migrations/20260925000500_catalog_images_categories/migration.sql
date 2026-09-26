BEGIN;
CREATE TABLE medicine_categories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 slug VARCHAR(100) NOT NULL UNIQUE,
 name VARCHAR(150) NOT NULL
);
ALTER TABLE medicines ADD COLUMN box_image_url TEXT,
 ADD COLUMN category_id UUID REFERENCES medicine_categories(id) ON DELETE SET NULL,
 ADD CONSTRAINT medicine_box_image_https CHECK (box_image_url IS NULL OR box_image_url ~ '^https://[^[:space:]]+$');
CREATE INDEX medicines_category_idx ON medicines(category_id);
INSERT INTO medicine_categories(slug,name) VALUES
 ('allergy','Allergy'), ('pain-relief','Pain relief'), ('diabetes','Diabetes'),
 ('cardiovascular','Cardiovascular'), ('digestive-health','Digestive health'),
 ('respiratory','Respiratory'), ('anti-infectives','Anti-infectives'),
 ('dermatology','Dermatology'), ('vitamins-minerals','Vitamins and minerals'), ('other','Other');
-- Reuse existing reviewed package photos, if any. No images are fabricated.
UPDATE medicines m SET box_image_url = (
 SELECT url FROM medicine_images i WHERE i.medicine_id=m.id AND i.image_type IN ('FRONT','PACKAGE')
 ORDER BY CASE WHEN i.image_type='FRONT' THEN 0 ELSE 1 END, i.sort_order, i.id LIMIT 1
);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='saydaliyati_app') THEN
   GRANT SELECT ON medicine_categories TO saydaliyati_app;
 END IF;
END $$;
COMMIT;
