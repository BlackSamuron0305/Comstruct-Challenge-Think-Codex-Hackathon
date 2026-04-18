-- Initial DB setup. Runs once on first postgres container start.
CREATE EXTENSION
IF NOT EXISTS vector;
CREATE EXTENSION
IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION
IF NOT EXISTS pg_trgm;

-- Schemas: each service owns one. Cross-schema refs by UUID only.
CREATE SCHEMA
IF NOT EXISTS catalog AUTHORIZATION comstruct_app;
CREATE SCHEMA
IF NOT EXISTS orders  AUTHORIZATION comstruct_app;
CREATE SCHEMA
IF NOT EXISTS auth    AUTHORIZATION comstruct_app;
CREATE SCHEMA
IF NOT EXISTS audit   AUTHORIZATION comstruct_app;

GRANT USAGE ON SCHEMA catalog, orders, auth, audit TO comstruct_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog, orders, auth, audit
GRANT ALL ON TABLES TO comstruct_app;
