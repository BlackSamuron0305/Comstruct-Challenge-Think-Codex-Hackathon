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
CREATE SCHEMA
IF NOT EXISTS procurement AUTHORIZATION comstruct_app;

GRANT USAGE ON SCHEMA catalog, orders, auth, audit, procurement TO comstruct_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog, orders, auth, audit, procurement
GRANT ALL ON TABLES TO comstruct_app;

-- ── Extra procurement tables (not in Alembic migrations) ──
-- Tables created by migration 0002: supplier_scores, price_history,
-- supplier_interactions, scrape_jobs, approved_suppliers.
-- Below are NEW tables only used by the AI service.

CREATE TABLE IF NOT EXISTS procurement.web_search_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL,
    query TEXT NOT NULL,
    results JSONB DEFAULT '[]',
    searched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_wsc_supplier ON procurement.web_search_cache(supplier_id);

CREATE TABLE IF NOT EXISTS procurement.preferred_suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    category VARCHAR(128),
    approved_by UUID,
    approved_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(company_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS ix_ps_company ON procurement.preferred_suppliers(company_id);

CREATE TABLE IF NOT EXISTS procurement.supplier_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    product_query TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    proposed_suppliers JSONB DEFAULT '[]',
    scoring_details JSONB DEFAULT '{}',
    web_search_summary TEXT,
    recommended_supplier_id UUID,
    approved_supplier_id UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_sp_company ON procurement.supplier_proposals(company_id);
CREATE INDEX IF NOT EXISTS ix_sp_status ON procurement.supplier_proposals(status);
