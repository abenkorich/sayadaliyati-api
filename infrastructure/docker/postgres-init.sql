\set ON_ERROR_STOP on
\getenv app_password APP_DB_PASSWORD
CREATE ROLE saydaliyati_app LOGIN PASSWORD :'app_password';
CREATE DATABASE saydaliyati_test OWNER saydaliyati_owner;
REVOKE CONNECT, TEMPORARY ON DATABASE saydaliyati FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE saydaliyati_test FROM PUBLIC;
GRANT CONNECT ON DATABASE saydaliyati TO saydaliyati_app;
GRANT CONNECT ON DATABASE saydaliyati_test TO saydaliyati_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO saydaliyati_app;
\connect saydaliyati_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO saydaliyati_app;

-- Readiness only probes catalog metadata. Patient-table privileges will be
-- granted narrowly when the corresponding authenticated feature is implemented.
