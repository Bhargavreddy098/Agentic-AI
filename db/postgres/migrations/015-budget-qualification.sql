-- Task06 approved forward migration. Apply only through the reviewed DAG.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM budget_accounts) OR EXISTS (SELECT 1 FROM budget_reservations) THEN
  RAISE EXCEPTION 'Populated budget data requires separately reviewed migration';
 END IF;
END $$;
CREATE TABLE tenant_budget_limits (
 tenant_id text PRIMARY KEY REFERENCES tenants(tenant_id),
 token_limit bigint NOT NULL CHECK(token_limit BETWEEN 0 AND 9007199254740991),
 cost_limit_micro_usd bigint NOT NULL CHECK(cost_limit_micro_usd BETWEEN 0 AND 9007199254740991),
 charged_tokens numeric(40,0) NOT NULL DEFAULT 0 CHECK(charged_tokens>=0),
 charged_cost_micro_usd numeric(40,0) NOT NULL DEFAULT 0 CHECK(charged_cost_micro_usd>=0),
 suspended boolean NOT NULL DEFAULT false
);
ALTER TABLE budget_accounts ADD COLUMN token_limit bigint NOT NULL CHECK(token_limit BETWEEN 0 AND 9007199254740991);
ALTER TABLE budget_accounts ADD COLUMN charged_tokens numeric(40,0) NOT NULL DEFAULT 0 CHECK(charged_tokens>=0);
ALTER TABLE budget_accounts ADD COLUMN suspended boolean NOT NULL DEFAULT false;
ALTER TABLE budget_accounts ALTER COLUMN current_spend_micro_usd TYPE numeric(40,0);
ALTER TABLE budget_accounts ADD CONSTRAINT budget_safe_cost_limit CHECK(monthly_limit_micro_usd BETWEEN 0 AND 9007199254740991 AND current_spend_micro_usd>=0);
ALTER TABLE budget_reservations ADD COLUMN tenant_id text NOT NULL;
ALTER TABLE budget_reservations ADD COLUMN root_run_id text NOT NULL;
ALTER TABLE budget_reservations ADD COLUMN writer_epoch bigint NOT NULL CHECK(writer_epoch BETWEEN 1 AND 9007199254740991);
ALTER TABLE budget_reservations ADD COLUMN operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 128);
ALTER TABLE budget_reservations ADD COLUMN proof jsonb;
ALTER TABLE budget_reservations ADD COLUMN dispatched_at timestamptz;
ALTER TABLE budget_reservations ADD CONSTRAINT budget_reservation_tenant FOREIGN KEY(account_id,tenant_id) REFERENCES budget_accounts(account_id,tenant_id);
ALTER TABLE budget_reservations ADD CONSTRAINT budget_reservation_run FOREIGN KEY(run_id,tenant_id) REFERENCES runs(run_id,tenant_id);
ALTER TABLE budget_reservations ADD CONSTRAINT budget_reservation_root FOREIGN KEY(root_run_id,tenant_id) REFERENCES runs(run_id,tenant_id);
ALTER TABLE budget_reservations ADD CONSTRAINT budget_operation_identity UNIQUE(tenant_id,account_id,operation_key);
CREATE INDEX budget_history_scope ON budget_reservations(tenant_id,account_id,created_at,reservation_id);
ALTER TABLE budget_reservations DROP CONSTRAINT budget_reservations_status_check;
ALTER TABLE budget_reservations ADD CONSTRAINT budget_reservation_phase CHECK(status IN ('reserved','dispatched','unknown','settled','released'));
ALTER TABLE budget_reservations ADD CONSTRAINT budget_safe_quantities CHECK(reserved_tokens BETWEEN 0 AND 9007199254740991 AND reserved_cost_micro_usd BETWEEN 0 AND 9007199254740991 AND (settled_tokens IS NULL OR settled_tokens BETWEEN 0 AND 9007199254740991) AND (settled_cost_micro_usd IS NULL OR settled_cost_micro_usd BETWEEN 0 AND 9007199254740991));
ALTER TABLE budget_reservations ADD CONSTRAINT budget_usage_phase CHECK((status='settled' AND settled_tokens IS NOT NULL AND settled_cost_micro_usd IS NOT NULL AND proof IS NOT NULL AND settled_at IS NOT NULL) OR (status<>'settled' AND settled_tokens IS NULL AND settled_cost_micro_usd IS NULL AND proof IS NULL));
ALTER TABLE budget_reservations ADD CONSTRAINT budget_proof_bound CHECK(proof IS NULL OR (jsonb_typeof(proof)='object' AND octet_length(proof::text)<=65536));

CREATE FUNCTION b06_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Budget history is immutable'; END IF;
 IF (NEW.reservation_id,NEW.account_id,NEW.tenant_id,NEW.run_id,NEW.root_run_id,NEW.writer_epoch,NEW.operation_key,NEW.reserved_tokens,NEW.reserved_cost_micro_usd,NEW.created_at)
 IS DISTINCT FROM (OLD.reservation_id,OLD.account_id,OLD.tenant_id,OLD.run_id,OLD.root_run_id,OLD.writer_epoch,OLD.operation_key,OLD.reserved_tokens,OLD.reserved_cost_micro_usd,OLD.created_at) THEN RAISE EXCEPTION 'Budget bounds are immutable'; END IF;
 IF OLD.status IN ('settled','released') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final budget record is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_immutable BEFORE UPDATE OR DELETE ON budget_reservations FOR EACH ROW EXECUTE FUNCTION b06_immutable();

-- Shared M04 lock order: session -> run -> lease -> tenant limit -> account.
CREATE OR REPLACE FUNCTION b06_writer(ctx jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r runs%ROWTYPE; sid uuid; tenant text:=current_setting('asi.tenant_id',true); rid uuid:=(ctx->>'runId')::uuid; epoch bigint:=(ctx->>'writerEpoch')::bigint;
BEGIN
 SELECT session_id INTO sid FROM runs WHERE run_id=rid AND tenant_id=tenant;
 IF sid IS NULL THEN RAISE EXCEPTION 'Unknown budget run'; END IF;
 PERFORM 1 FROM sessions WHERE session_id=sid AND tenant_id=tenant FOR UPDATE;
 SELECT * INTO r FROM runs WHERE run_id=rid AND tenant_id=tenant FOR UPDATE;
 PERFORM 1 FROM writer_leases WHERE session_id=sid AND run_id=rid AND tenant_id=tenant FOR UPDATE;
 PERFORM m04_require_writer(rid,tenant,epoch);
 IF r.writer_epoch IS DISTINCT FROM epoch OR r.session_id IS DISTINCT FROM ctx->>'sessionId' OR r.mode IS DISTINCT FROM ctx->>'mode'
 OR r.deadline_at IS DISTINCT FROM (ctx->>'deadlineAt')::timestamptz OR r.budget_account_id IS DISTINCT FROM ctx->'budgetRef'->>'accountId'
 OR tenant IS DISTINCT FROM ctx->'budgetRef'->>'tenantId' OR r.parent_run_id IS DISTINCT FROM ctx->>'parentRunId' THEN RAISE EXCEPTION 'Noncanonical budget context'; END IF;
 IF NOT EXISTS (WITH RECURSIVE family AS (
 SELECT run_id,parent_run_id,budget_account_id,ARRAY[run_id] AS path FROM runs WHERE run_id=rid AND tenant_id=tenant
 UNION ALL SELECT p.run_id,p.parent_run_id,p.budget_account_id,f.path||p.run_id FROM runs p JOIN family f ON p.run_id=f.parent_run_id
 WHERE p.tenant_id=tenant AND p.budget_account_id=r.budget_account_id AND NOT p.run_id=ANY(f.path) AND cardinality(f.path)<64)
 SELECT 1 FROM family WHERE run_id=ctx->'budgetRef'->>'rootRunId' AND parent_run_id IS NULL AND budget_account_id=r.budget_account_id) THEN RAISE EXCEPTION 'Invalid shared budget root'; END IF;
END $$;
CREATE OR REPLACE FUNCTION b06_lock(tenant text,account uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM 1 FROM tenant_budget_limits WHERE tenant_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing tenant budget quotas'; END IF;
  PERFORM 1 FROM budget_accounts WHERE tenant_id=tenant AND account_id=account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown tenant budget account'; END IF;
END $$;
CREATE OR REPLACE FUNCTION b06_reserve(ctx jsonb,operation text,quantity bigint,cost bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE tenant text:=current_setting('asi.tenant_id',true); account uuid:=(ctx->'budgetRef'->>'accountId')::uuid; a budget_accounts%ROWTYPE; t tenant_budget_limits%ROWTYPE; prior budget_reservations%ROWTYPE; id text;
BEGIN
 IF quantity IS NULL OR cost IS NULL OR quantity NOT BETWEEN 0 AND 9007199254740991 OR cost NOT BETWEEN 0 AND 9007199254740991 OR operation IS NULL OR length(operation) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Invalid budget quantities or operation'; END IF;
 PERFORM b06_writer(ctx); PERFORM b06_lock(tenant,account); PERFORM m04_require_writer(ctx->>'runId',tenant,(ctx->>'writerEpoch')::bigint);
 SELECT * INTO prior FROM budget_reservations WHERE tenant_id=tenant AND account_id=account AND operation_key=operation;
 IF FOUND THEN
  IF (prior.run_id,prior.root_run_id,prior.writer_epoch,prior.reserved_tokens,prior.reserved_cost_micro_usd) IS DISTINCT FROM (ctx->>'runId',ctx->'budgetRef'->>'rootRunId',(ctx->>'writerEpoch')::bigint,quantity,cost) OR prior.status='released' THEN RAISE EXCEPTION 'Immutable reservation conflict'; END IF;
  RETURN to_jsonb(prior);
 END IF;
 SELECT * INTO a FROM budget_accounts WHERE tenant_id=tenant AND account_id=account;
 SELECT * INTO t FROM tenant_budget_limits WHERE tenant_id=tenant;
 IF a.suspended OR t.suspended OR a.charged_tokens+quantity>a.token_limit OR a.current_spend_micro_usd+cost>a.monthly_limit_micro_usd OR t.charged_tokens+quantity>t.token_limit OR t.charged_cost_micro_usd+cost>t.cost_limit_micro_usd THEN RAISE EXCEPTION 'Budget exhausted or suspended'; END IF;
 UPDATE tenant_budget_limits SET charged_tokens=charged_tokens+quantity,charged_cost_micro_usd=charged_cost_micro_usd+cost WHERE tenant_id=tenant;
 UPDATE budget_accounts SET charged_tokens=charged_tokens+quantity,current_spend_micro_usd=current_spend_micro_usd+cost WHERE tenant_id=tenant AND account_id=account;
 id:=gen_random_uuid()::text;
 INSERT INTO budget_reservations(reservation_id,account_id,tenant_id,run_id,root_run_id,writer_epoch,operation_key,reserved_tokens,reserved_cost_micro_usd,status)
 VALUES(id,account,tenant,ctx->>'runId',ctx->'budgetRef'->>'rootRunId',(ctx->>'writerEpoch')::bigint,operation,quantity,cost,'reserved') RETURNING * INTO prior;
 RETURN to_jsonb(prior);
END $$;
CREATE OR REPLACE FUNCTION b06_change(ctx jsonb,id text,action text,quantity bigint,cost bigint,usage jsonb,billing boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE tenant text:=current_setting('asi.tenant_id',true); b budget_reservations%ROWTYPE; delta_tokens numeric; delta_cost numeric;
BEGIN
 SELECT * INTO b FROM budget_reservations WHERE reservation_id=id AND tenant_id=tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown tenant reservation'; END IF;
 IF NOT billing THEN
   PERFORM b06_writer(ctx);
   IF (b.run_id,b.root_run_id,b.writer_epoch,b.account_id) IS DISTINCT FROM (ctx->>'runId',ctx->'budgetRef'->>'rootRunId',(ctx->>'writerEpoch')::bigint,(ctx->'budgetRef'->>'accountId')::uuid) THEN RAISE EXCEPTION 'Reservation writer mismatch'; END IF;
 END IF;
 PERFORM b06_lock(tenant,b.account_id);
 SELECT * INTO b FROM budget_reservations WHERE reservation_id=id AND tenant_id=tenant FOR UPDATE;
 IF NOT billing THEN PERFORM m04_require_writer(b.run_id,tenant,b.writer_epoch); END IF;
 IF action='settle' THEN
  IF quantity IS NULL OR cost IS NULL OR quantity NOT BETWEEN 0 AND 9007199254740991 OR cost NOT BETWEEN 0 AND 9007199254740991 OR usage IS NULL OR jsonb_typeof(usage)<>'object' OR octet_length(usage::text)>65536 THEN RAISE EXCEPTION 'Invalid actual usage or proof'; END IF;
  IF b.status='settled' THEN
   IF (b.settled_tokens,b.settled_cost_micro_usd,b.proof) IS DISTINCT FROM (quantity,cost,usage) THEN RAISE EXCEPTION 'Conflicting settlement'; END IF;
   RETURN;
  END IF;
  IF b.status NOT IN ('dispatched','unknown') THEN RAISE EXCEPTION 'Only dispatched usage can settle'; END IF;
  delta_tokens:=quantity-b.reserved_tokens; delta_cost:=cost-b.reserved_cost_micro_usd;
  UPDATE budget_accounts SET charged_tokens=charged_tokens+delta_tokens,current_spend_micro_usd=current_spend_micro_usd+delta_cost,
   suspended=suspended OR quantity>b.reserved_tokens OR cost>b.reserved_cost_micro_usd OR charged_tokens+delta_tokens>token_limit OR current_spend_micro_usd+delta_cost>monthly_limit_micro_usd WHERE account_id=b.account_id AND tenant_id=tenant;
  UPDATE tenant_budget_limits SET charged_tokens=charged_tokens+delta_tokens,charged_cost_micro_usd=charged_cost_micro_usd+delta_cost,
   suspended=suspended OR quantity>b.reserved_tokens OR cost>b.reserved_cost_micro_usd OR charged_tokens+delta_tokens>token_limit OR charged_cost_micro_usd+delta_cost>cost_limit_micro_usd WHERE tenant_id=tenant;
  UPDATE budget_reservations SET status='settled',settled_tokens=quantity,settled_cost_micro_usd=cost,proof=usage,settled_at=clock_timestamp() WHERE reservation_id=id AND tenant_id=tenant;
 ELSIF action='release' THEN
  IF b.status='released' THEN RETURN; END IF;
  IF b.status<>'reserved' OR b.dispatched_at IS NOT NULL THEN RAISE EXCEPTION 'Dispatched or unknown budget cannot be released'; END IF;
  UPDATE budget_accounts SET charged_tokens=charged_tokens-b.reserved_tokens,current_spend_micro_usd=current_spend_micro_usd-b.reserved_cost_micro_usd WHERE account_id=b.account_id AND tenant_id=tenant;
  UPDATE tenant_budget_limits SET charged_tokens=charged_tokens-b.reserved_tokens,charged_cost_micro_usd=charged_cost_micro_usd-b.reserved_cost_micro_usd WHERE tenant_id=tenant;
  UPDATE budget_reservations SET status='released',settled_at=clock_timestamp() WHERE reservation_id=id AND tenant_id=tenant;
 ELSIF action='dispatch' AND NOT billing THEN
  IF b.status='dispatched' THEN RETURN; END IF;
  IF b.status<>'reserved' THEN RAISE EXCEPTION 'Reservation cannot dispatch'; END IF;
  UPDATE budget_reservations SET status='dispatched',dispatched_at=clock_timestamp() WHERE reservation_id=id AND tenant_id=tenant;
 ELSIF action='unknown' AND NOT billing THEN
  IF b.status='unknown' THEN RETURN; END IF;
  IF b.status<>'dispatched' THEN RAISE EXCEPTION 'Only dispatched reservations can become unknown'; END IF;
  UPDATE budget_reservations SET status='unknown' WHERE reservation_id=id AND tenant_id=tenant;
 ELSE RAISE EXCEPTION 'Invalid budget action'; END IF;
END $$;
CREATE FUNCTION b06_write(ctx jsonb,id text,action text,quantity bigint,cost bigint,usage jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT b06_change(ctx,id,action,quantity,cost,usage,false) $$;
CREATE FUNCTION b06_reconcile(id text,action text,quantity bigint,cost bigint,usage jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT b06_change(NULL,id,action,quantity,cost,usage,true) $$;
CREATE OR REPLACE FUNCTION b06_state(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE tenant text:=current_setting('asi.tenant_id',true); account uuid:=(ctx->'budgetRef'->>'accountId')::uuid; result jsonb;
BEGIN
 PERFORM b06_writer(ctx); PERFORM b06_lock(tenant,account); PERFORM m04_require_writer(ctx->>'runId',tenant,(ctx->>'writerEpoch')::bigint);
 SELECT jsonb_build_object('account',to_jsonb(a)||jsonb_build_object('charged_tokens',a.charged_tokens::text,'current_spend_micro_usd',a.current_spend_micro_usd::text),'tenant',to_jsonb(t)||jsonb_build_object('charged_tokens',t.charged_tokens::text,'charged_cost_micro_usd',t.charged_cost_micro_usd::text)) INTO result FROM budget_accounts a JOIN tenant_budget_limits t ON t.tenant_id=a.tenant_id WHERE a.tenant_id=tenant AND a.account_id=account;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION b06_history(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb; history jsonb;
BEGIN
 result:=b06_state(ctx);
 SELECT coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) INTO history FROM (SELECT * FROM budget_reservations WHERE tenant_id=current_setting('asi.tenant_id',true) AND account_id=(ctx->'budgetRef'->>'accountId')::uuid ORDER BY created_at,reservation_id LIMIT 1001) b;
 IF jsonb_array_length(history)>1000 THEN RAISE EXCEPTION 'Complete snapshot requires bounded history query'; END IF;
 RETURN result||jsonb_build_object('reservations',history);
END $$;
CREATE OR REPLACE FUNCTION b06_lookup(ctx jsonb,id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 PERFORM b06_state(ctx);
 SELECT to_jsonb(b) INTO result FROM budget_reservations b WHERE b.reservation_id=id AND b.tenant_id=current_setting('asi.tenant_id',true) AND b.account_id=(ctx->'budgetRef'->>'accountId')::uuid AND b.run_id=ctx->>'runId' AND b.root_run_id=ctx->'budgetRef'->>'rootRunId';
 RETURN result;
END $$;
-- Definer routines have a fixed trusted search path. Only deployment grants their entry points.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS identity FROM pg_proc p WHERE p.pronamespace=current_schema()::regnamespace AND p.proname LIKE 'b06_%' LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path=%I,pg_temp',f.identity,current_schema());
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.identity);
 END LOOP;
END $$;
ALTER TABLE tenant_budget_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_budget_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_tenant_limits_scope ON tenant_budget_limits USING(tenant_id=current_setting('asi.tenant_id',true)) WITH CHECK(tenant_id=current_setting('asi.tenant_id',true));
ALTER TABLE budget_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_account_scope ON budget_accounts USING(tenant_id=current_setting('asi.tenant_id',true)) WITH CHECK(tenant_id=current_setting('asi.tenant_id',true));
ALTER TABLE budget_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_reservation_scope ON budget_reservations USING(tenant_id=current_setting('asi.tenant_id',true)) WITH CHECK(tenant_id=current_setting('asi.tenant_id',true));
REVOKE ALL ON tenant_budget_limits,budget_accounts,budget_reservations FROM PUBLIC;
