CREATE TABLE admin_directory_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind varchar(20) NOT NULL CHECK (kind IN ('doctors','pharmacies','hospitals')),
 name varchar(255) NOT NULL CHECK (length(trim(name)) > 0), specialty varchar(150), license_number varchar(150),
 address varchar(500), city varchar(100), phone varchar(32), email varchar(320),
 status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
 created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX admin_directory_kind_name_idx ON admin_directory_entries(kind,name);
CREATE TABLE admin_settings (
 id varchar(20) PRIMARY KEY CHECK (id = 'platform'), organization_name varchar(150) NOT NULL,
 support_email varchar(320), default_language varchar(2) NOT NULL CHECK (default_language IN ('EN','FR','AR')),
 timezone varchar(64) NOT NULL, updated_at timestamptz(6) NOT NULL DEFAULT now()
);
