-- M04 reviewed forward migration. 001 and 009 remain immutable prerequisites.
-- Apply transactionally through the explicit migration runner, never by numeric glob.
CREATE TEMP TABLE m04_saved_foreign_keys ON COMMIT DROP AS
SELECT conrelid::regclass AS relation, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype='f' AND connamespace=current_schema()::regnamespace;
DO $$
DECLARE item record; prior_default text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class target ON target.oid=c.confrelid
      WHERE c.contype='f' AND target.relnamespace=current_schema()::regnamespace
      AND c.connamespace<>current_schema()::regnamespace) THEN
    RAISE EXCEPTION 'External schema references require explicit migration review';
  END IF;
  FOR item IN SELECT * FROM m04_saved_foreign_keys LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.conname);
  END LOOP;
  FOR item IN SELECT c.oid::regclass AS relation,a.attname,a.atttypid,pg_get_expr(d.adbin,d.adrelid) AS default_expr
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE c.relnamespace=current_schema()::regnamespace AND c.relkind='r' AND NOT a.attisdropped
      AND c.relname IN ('ingress_events','sessions','runs','writer_leases','checkpoints','outbox','effect_journal','budget_accounts','budget_reservations','approvals','audit_receipts','delivery_outbox')
      AND a.atttypid IN ('uuid'::regtype,'uuid[]'::regtype) LOOP
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP DEFAULT',item.relation,item.attname);
    IF item.atttypid='uuid'::regtype THEN
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE text USING %I::text',item.relation,item.attname,item.attname);
      IF item.default_expr IS NOT NULL THEN EXECUTE format('ALTER TABLE %s ALTER COLUMN %I SET DEFAULT (%s)::text',item.relation,item.attname,item.default_expr); END IF;
    ELSE
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE text[] USING %I::text[]',item.relation,item.attname,item.attname);
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I SET DEFAULT ARRAY[]::text[]',item.relation,item.attname);
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM m04_saved_foreign_keys LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item.relation,item.conname,item.definition);
  END LOOP;
END $$;
ALTER TABLE sessions ADD COLUMN writer_epoch bigint NOT NULL DEFAULT 0 CHECK(writer_epoch BETWEEN 0 AND 9007199254740991);
UPDATE sessions s SET writer_epoch=coalesce((SELECT max(writer_epoch) FROM runs r WHERE r.session_id=s.session_id),0);
ALTER TABLE runs ADD CONSTRAINT safe_run_epoch CHECK(writer_epoch BETWEEN 0 AND 9007199254740991);
ALTER TABLE sessions ADD CONSTRAINT session_tenant_identity UNIQUE(session_id,tenant_id);
ALTER TABLE runs ADD CONSTRAINT run_tenant_identity UNIQUE(run_id,tenant_id);
ALTER TABLE runs ADD CONSTRAINT run_session_tenant_identity UNIQUE(run_id,session_id,tenant_id);
ALTER TABLE runs ADD CONSTRAINT run_session_tenant FOREIGN KEY(session_id,tenant_id) REFERENCES sessions(session_id,tenant_id);
ALTER TABLE budget_accounts ADD CONSTRAINT budget_tenant_identity UNIQUE(account_id,tenant_id);
ALTER TABLE runs ADD CONSTRAINT run_budget_scope FOREIGN KEY(budget_account_id,tenant_id) REFERENCES budget_accounts(account_id,tenant_id);
ALTER TABLE runs ADD CONSTRAINT run_parent_scope FOREIGN KEY(parent_run_id,tenant_id) REFERENCES runs(run_id,tenant_id) ON DELETE SET NULL (parent_run_id);
ALTER TABLE writer_leases ADD COLUMN tenant_id text;
UPDATE writer_leases l SET tenant_id=r.tenant_id FROM runs r WHERE r.run_id=l.run_id;
ALTER TABLE writer_leases ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE writer_leases ADD COLUMN owner_id text NOT NULL;
ALTER TABLE writer_leases ADD CONSTRAINT lease_run_scope FOREIGN KEY(run_id,session_id,tenant_id) REFERENCES runs(run_id,session_id,tenant_id);
ALTER TABLE writer_leases ADD CONSTRAINT safe_lease_epoch CHECK(writer_epoch BETWEEN 1 AND 9007199254740991);
ALTER TABLE checkpoints ADD COLUMN checkpoint_json jsonb NOT NULL;
ALTER TABLE checkpoints ADD CONSTRAINT unique_checkpoint_version UNIQUE(run_id,version);
ALTER TABLE checkpoints ADD CONSTRAINT checkpoint_run_scope FOREIGN KEY(run_id,tenant_id) REFERENCES runs(run_id,tenant_id);
ALTER TABLE checkpoints ADD CONSTRAINT safe_checkpoint_numbers CHECK(writer_epoch BETWEEN 1 AND 9007199254740991 AND version BETWEEN 1 AND 9007199254740991);
ALTER TABLE checkpoints ADD CONSTRAINT checkpoint_identity CHECK(
 checkpoint_json->>'checkpointId'=checkpoint_id AND checkpoint_json->>'version'=version::text
 AND checkpoint_json->'runContext'->>'runId'=run_id
 AND checkpoint_json->'runContext'->'budgetRef'->>'tenantId'=tenant_id
 AND checkpoint_json->'runContext'->>'writerEpoch'=writer_epoch::text);
ALTER TABLE outbox ALTER COLUMN run_id DROP NOT NULL;
ALTER TABLE outbox ADD COLUMN writer_epoch bigint;
ALTER TABLE outbox ADD CONSTRAINT outbox_run_scope FOREIGN KEY(run_id,tenant_id) REFERENCES runs(run_id,tenant_id);
ALTER TABLE outbox ADD CONSTRAINT outbox_projection_binding CHECK(
 (payload_type='ingress_projection' AND run_id IS NULL AND writer_epoch IS NULL)
 OR (payload_type<>'ingress_projection' AND run_id IS NOT NULL AND writer_epoch IS NOT NULL AND writer_epoch BETWEEN 1 AND 9007199254740991));
ALTER TABLE outbox ADD CONSTRAINT bounded_outbox_attempts CHECK(attempts BETWEEN 0 AND max_attempts AND max_attempts BETWEEN 1 AND 10);
ALTER TABLE effect_journal ADD COLUMN writer_epoch bigint NOT NULL;
ALTER TABLE effect_journal ADD COLUMN intent_json jsonb NOT NULL;
ALTER TABLE effect_journal ADD CONSTRAINT effect_run_scope FOREIGN KEY(run_id,tenant_id) REFERENCES runs(run_id,tenant_id);
ALTER TABLE effect_journal ADD CONSTRAINT safe_effect_epoch CHECK(writer_epoch BETWEEN 1 AND 9007199254740991);
ALTER TABLE effect_journal ADD CONSTRAINT bounded_effect_attempts CHECK(attempts BETWEEN 0 AND max_attempts AND max_attempts BETWEEN 1 AND 10);

CREATE FUNCTION m04_require_writer(p_run text,p_tenant text,p_epoch bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM runs r JOIN sessions s ON s.session_id=r.session_id AND s.tenant_id=r.tenant_id
  JOIN writer_leases l ON l.session_id=r.session_id AND l.run_id=r.run_id AND l.tenant_id=r.tenant_id
  WHERE r.run_id=p_run AND r.tenant_id=p_tenant AND r.writer_epoch=p_epoch AND l.writer_epoch=p_epoch
  AND l.owner_id=current_setting('asi.owner_id',true) AND p_tenant=current_setting('asi.tenant_id',true)
  AND l.expires_at>clock_timestamp() AND r.deadline_at>clock_timestamp() AND s.status='active'
  AND r.status IN ('running','waiting_approval')) THEN
  RAISE EXCEPTION 'Stale writer, expired lease or inactive run';
 END IF;
END $$;
CREATE FUNCTION m04_checkpoint_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Checkpoint history is immutable'; END IF;
 PERFORM m04_require_writer(NEW.run_id,NEW.tenant_id,NEW.writer_epoch);
 RETURN NEW;
END $$;
CREATE TRIGGER checkpoint_history_guard BEFORE INSERT OR UPDATE OR DELETE ON checkpoints FOR EACH ROW EXECUTE FUNCTION m04_checkpoint_guard();

CREATE FUNCTION m04_effect_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Effect intent cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.effect_id,NEW.tenant_id,NEW.run_id,NEW.task_id,NEW.effect_type,NEW.action,NEW.resource,NEW.input_hash,NEW.artifact_hash,NEW.idempotency_key,NEW.writer_epoch,NEW.intent_json,NEW.max_attempts)
    IS DISTINCT FROM (OLD.effect_id,OLD.tenant_id,OLD.run_id,OLD.task_id,OLD.effect_type,OLD.action,OLD.resource,OLD.input_hash,OLD.artifact_hash,OLD.idempotency_key,OLD.writer_epoch,OLD.intent_json,OLD.max_attempts) THEN
    RAISE EXCEPTION 'Effect intent is immutable';
  END IF;
  IF NOT ((OLD.status='planned' AND NEW.status='authorized' AND NEW.attempts=OLD.attempts)
   OR (OLD.status='authorized' AND NEW.status='executing' AND NEW.attempts=OLD.attempts+1)
   OR (OLD.status='executing' AND NEW.status IN ('succeeded','failed','unknown') AND NEW.attempts=OLD.attempts)) THEN
    RAISE EXCEPTION 'Invalid effect transition';
  END IF;
 ELSE
  IF NEW.status<>'planned' OR NEW.attempts<>0 THEN RAISE EXCEPTION 'Effect must start as a new intent'; END IF;
 END IF;
 PERFORM m04_require_writer(NEW.run_id,NEW.tenant_id,NEW.writer_epoch);
 RETURN NEW;
END $$;
CREATE TRIGGER effect_intent_guard BEFORE INSERT OR UPDATE OR DELETE ON effect_journal FOR EACH ROW EXECUTE FUNCTION m04_effect_guard();

CREATE FUNCTION m04_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Dispatch identity cannot be deleted'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.outbox_id,NEW.tenant_id,NEW.run_id,NEW.payload_type,NEW.payload_json,NEW.idempotency_key,NEW.writer_epoch,NEW.max_attempts)
   IS DISTINCT FROM (OLD.outbox_id,OLD.tenant_id,OLD.run_id,OLD.payload_type,OLD.payload_json,OLD.idempotency_key,OLD.writer_epoch,OLD.max_attempts)
   THEN RAISE EXCEPTION 'Dispatch payload is immutable'; END IF;
  IF NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 OR OLD.status IN ('published','dead_letter') THEN
   RAISE EXCEPTION 'Invalid dispatch transition'; END IF;
 END IF;
 IF NEW.run_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.attempts IS DISTINCT FROM OLD.attempts) THEN
  PERFORM m04_require_writer(NEW.run_id,NEW.tenant_id,NEW.writer_epoch);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dispatch_guard BEFORE INSERT OR UPDATE OR DELETE ON outbox FOR EACH ROW EXECUTE FUNCTION m04_outbox_guard();

DO $$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['tenants','ingress_events','sessions','runs','writer_leases','checkpoints','outbox','effect_journal'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY authenticated_tenant ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))',relation);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation);
 END LOOP;
END $$;

