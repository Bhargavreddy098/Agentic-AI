-- ASI Agent System - Budget Schema
-- Migration 003: Base budget accounts and reservations (Task 06)
-- Depends on: 001-control.sql (tenants, runs, writer_leases)
-- PostgreSQL 17 compatible

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Budget tables are created in 001-control.sql
-- This migration adds constraints and indexes for base budget functionality

-- Add missing constraints to budget_accounts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'budget_accounts' AND constraint_name = 'budget_safe_cost_limit') THEN
    ALTER TABLE budget_accounts ADD CONSTRAINT budget_safe_cost_limit CHECK (
      monthly_limit_micro_usd BETWEEN 0 AND 9007199254740991 AND current_spend_micro_usd >= 0
    );
  END IF;
END $$;

-- Add missing constraints to budget_reservations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'budget_reservations' AND constraint_name = 'budget_reservation_run') THEN
    ALTER TABLE budget_reservations ADD CONSTRAINT budget_reservation_run
      FOREIGN KEY (run_id, tenant_id) REFERENCES runs(run_id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'budget_reservations' AND constraint_name = 'budget_reservation_account') THEN
    ALTER TABLE budget_reservations ADD CONSTRAINT budget_reservation_account
      FOREIGN KEY (account_id, tenant_id) REFERENCES budget_accounts(account_id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'budget_reservations' AND constraint_name = 'budget_safe_quantities') THEN
    ALTER TABLE budget_reservations ADD CONSTRAINT budget_safe_quantities CHECK (
      reserved_tokens BETWEEN 0 AND 9007199254740991 AND
      reserved_cost_micro_usd BETWEEN 0 AND 9007199254740991 AND
      (settled_tokens IS NULL OR settled_tokens BETWEEN 0 AND 9007199254740991) AND
      (settled_cost_micro_usd IS NULL OR settled_cost_micro_usd BETWEEN 0 AND 9007199254740991)
    );
  END IF;
END $$;

-- Add indexes for budget queries
CREATE INDEX IF NOT EXISTS budget_history_scope ON budget_reservations(tenant_id, account_id, created_at, reservation_id);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_tenant ON budget_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_reservations_account_status ON budget_reservations(account_id, status) WHERE status = 'reserved';

-- Add tenant_id column to budget_reservations if missing (for RLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budget_reservations' AND column_name = 'tenant_id') THEN
    ALTER TABLE budget_reservations ADD COLUMN tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE;
    UPDATE budget_reservations SET tenant_id = (
      SELECT r.tenant_id FROM runs r WHERE r.run_id = budget_reservations.run_id
    );
    ALTER TABLE budget_reservations ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- Enable RLS on budget tables (base level)
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['budget_accounts','budget_reservations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY budget_tenant_scope ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))', relation);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', relation);
  END LOOP;
END $$;

-- Grant control service role access (to be created by deployment)
-- GRANT SELECT, INSERT, UPDATE ON budget_accounts, budget_reservations TO asi_control;