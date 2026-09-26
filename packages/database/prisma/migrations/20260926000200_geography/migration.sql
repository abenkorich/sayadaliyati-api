CREATE TABLE geo_zones (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind varchar(10) NOT NULL CHECK(kind IN ('countries','wilayas','communes')),
code varchar(32) NOT NULL, scope varchar(36) NOT NULL, parent_id uuid REFERENCES geo_zones(id) ON DELETE RESTRICT,
name_english varchar(150) NOT NULL, name_french varchar(150), name_arabic varchar(150), zone varchar(32), is_deliverable boolean,
CONSTRAINT geo_zones_kind_scope_code_key UNIQUE(kind,scope,code),
CHECK ((kind='countries' AND parent_id IS NULL AND scope='ROOT') OR (kind<>'countries' AND parent_id IS NOT NULL AND scope=parent_id::text))
);
CREATE INDEX geo_zones_parent_id_name_english_idx ON geo_zones(parent_id,name_english);
ALTER TABLE admin_directory_entries ADD COLUMN country_id uuid REFERENCES geo_zones(id) ON DELETE RESTRICT,
ADD COLUMN wilaya_id uuid REFERENCES geo_zones(id) ON DELETE RESTRICT,
ADD COLUMN commune_id uuid REFERENCES geo_zones(id) ON DELETE RESTRICT;
CREATE INDEX admin_directory_entries_country_id_wilaya_id_commune_id_idx ON admin_directory_entries(country_id,wilaya_id,commune_id);
