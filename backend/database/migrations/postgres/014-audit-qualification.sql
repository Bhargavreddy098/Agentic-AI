-- Reviewed Task05 forward qualification. Applied 001/009/010 are unchanged.
-- Nonempty legacy chains require a separately reviewed, verifiable migration.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM audit_receipts) THEN
  RAISE EXCEPTION 'Nonempty legacy audit chain requires explicit verification and migration review';
 END IF;
END $$;

ALTER TABLE audit_receipts DROP CONSTRAINT IF EXISTS audit_receipts_status_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_terminal_status' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_terminal_status CHECK(status IN ('succeeded','failed','unknown'));
  END IF;
END $$;
ALTER TABLE audit_receipts ALTER COLUMN session_id SET NOT NULL;
ALTER TABLE audit_receipts ALTER COLUMN run_id SET NOT NULL;
ALTER TABLE audit_receipts ALTER COLUMN effect_id SET NOT NULL;
ALTER TABLE audit_receipts ALTER COLUMN output_hash SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_receipts' AND column_name = 'receipt_json') THEN
    ALTER TABLE audit_receipts ADD COLUMN receipt_json jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE audit_receipts ALTER COLUMN receipt_json DROP DEFAULT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_receipts' AND column_name = 'canonical_bytes') THEN
    ALTER TABLE audit_receipts ADD COLUMN canonical_bytes bytea NOT NULL DEFAULT ''::bytea;
    ALTER TABLE audit_receipts ALTER COLUMN canonical_bytes DROP DEFAULT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_receipts' AND column_name = 'receipt_hash') THEN
    ALTER TABLE audit_receipts ADD COLUMN receipt_hash bytea NOT NULL DEFAULT ''::bytea;
    ALTER TABLE audit_receipts ALTER COLUMN receipt_hash DROP DEFAULT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_safe_sequence' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_safe_sequence CHECK(sequence BETWEEN 1 AND 9007199254740991);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_hash_lengths' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_hash_lengths CHECK(octet_length(previous_hash)=32 AND octet_length(input_hash)=32 AND octet_length(output_hash)=32 AND octet_length(receipt_hash)=32 AND octet_length(signature)=32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_no_unsigned_task' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_no_unsigned_task CHECK(task_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_bounded_json' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_bounded_json CHECK(octet_length(canonical_bytes)<=16384 AND octet_length(receipt_json::text)<=32768);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_canonical_content' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_canonical_content CHECK(convert_from(canonical_bytes,'UTF8')::jsonb=receipt_json AND digest(canonical_bytes,'sha256')=receipt_hash);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_receipt_projection' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_receipt_projection CHECK(
      receipt_json=jsonb_build_object('schemaVersion',1,'receiptId',receipt_id,'tenantId',tenant_id,
      'sessionId',session_id,'runId',run_id,'effectId',effect_id,'sequence',sequence,
      'previousHash',encode(previous_hash,'hex'),'inputHash',encode(input_hash,'hex'),'outputHash',encode(output_hash,'hex'),
      'status',status,'mode',mode,'policyVersion',policy_version,'timestamp',receipt_json->>'timestamp','keyId',key_id,'signature',encode(signature,'hex'))
      AND jsonb_typeof(receipt_json->'timestamp') IS NOT DISTINCT FROM 'string'
      AND (receipt_json->>'timestamp')::timestamptz=timestamp);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_unique_effect' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_unique_effect UNIQUE(tenant_id,effect_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_effect_tenant_identity' AND conrelid = 'effect_journal'::regclass) THEN
    ALTER TABLE effect_journal ADD CONSTRAINT audit_effect_tenant_identity UNIQUE(effect_id,tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_run_session_tenant' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_run_session_tenant FOREIGN KEY(run_id,session_id,tenant_id) REFERENCES runs(run_id,session_id,tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_effect_tenant' AND conrelid = 'audit_receipts'::regclass) THEN
    ALTER TABLE audit_receipts ADD CONSTRAINT audit_effect_tenant FOREIGN KEY(effect_id,tenant_id) REFERENCES effect_journal(effect_id,tenant_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_chain_heads' AND schemaname = current_schema()) THEN
    CREATE TABLE audit_chain_heads(
      tenant_id text PRIMARY KEY REFERENCES tenants(tenant_id),
      sequence bigint NOT NULL CHECK(sequence BETWEEN 0 AND 9007199254740991),
      receipt_hash bytea NOT NULL CHECK(octet_length(receipt_hash)=32),
      CHECK(sequence<>0 OR receipt_hash=decode(repeat('0',64),'hex'))
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_head_guard' AND pronamespace = current_schema()::regnamespace) THEN
    CREATE FUNCTION audit_head_guard() RETURNS trigger LANGUAGE plpgsql AS $func$
    BEGIN
      IF TG_OP='INSERT' THEN
        IF NEW.sequence<>0 OR NEW.receipt_hash<>decode(repeat('0',64),'hex') THEN RAISE EXCEPTION 'Head must start at genesis'; END IF;
        RETURN NEW;
      END IF;
      IF TG_OP='UPDATE' AND pg_trigger_depth()=2 THEN
        IF NEW.tenant_id=OLD.tenant_id AND NEW.sequence=OLD.sequence+1
          AND EXISTS(SELECT 1 FROM audit_receipts WHERE tenant_id=NEW.tenant_id AND sequence=NEW.sequence
           AND previous_hash=OLD.receipt_hash AND receipt_hash=NEW.receipt_hash) THEN RETURN NEW; END IF;
      END IF;
      RAISE EXCEPTION 'Audit chain head is receipt-owned and immutable';
    END $func$;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_head_changes' AND tgrelid = 'audit_chain_heads'::regclass) THEN
    CREATE TRIGGER audit_head_changes BEFORE INSERT OR UPDATE OR DELETE ON audit_chain_heads FOR EACH ROW EXECUTE FUNCTION audit_head_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_head_truncate' AND tgrelid = 'audit_chain_heads'::regclass) THEN
    CREATE TRIGGER audit_head_truncate BEFORE TRUNCATE ON audit_chain_heads FOR EACH STATEMENT EXECUTE FUNCTION audit_head_guard();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_receipt_guard' AND pronamespace = current_schema()::regnamespace) THEN
    CREATE FUNCTION audit_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $func$
    DECLARE effect record; head record;
    BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Audit receipts are append-only'; END IF;
      PERFORM 1 FROM sessions WHERE session_id=NEW.session_id AND tenant_id=NEW.tenant_id FOR UPDATE;
      PERFORM 1 FROM runs WHERE run_id=NEW.run_id AND session_id=NEW.session_id AND tenant_id=NEW.tenant_id FOR UPDATE;
      PERFORM 1 FROM writer_leases WHERE session_id=NEW.session_id AND run_id=NEW.run_id AND tenant_id=NEW.tenant_id FOR UPDATE;
      SELECT * INTO effect FROM effect_journal WHERE effect_id=NEW.effect_id AND tenant_id=NEW.tenant_id;
      IF NOT FOUND OR effect.run_id<>NEW.run_id OR effect.input_hash<>NEW.input_hash
        OR effect.intent_json->'runContext'->>'mode' IS DISTINCT FROM NEW.mode
        OR effect.intent_json->'runContext'->>'sessionId' IS DISTINCT FROM NEW.session_id
        OR effect.intent_json->'runContext'->>'runId' IS DISTINCT FROM NEW.run_id
        OR effect.intent_json->'runContext'->>'writerEpoch' IS DISTINCT FROM effect.writer_epoch::text
        OR effect.intent_json->'runContext'->'budgetRef'->>'tenantId' IS DISTINCT FROM NEW.tenant_id
        OR NOT (effect.status='executing' OR effect.status=NEW.status) THEN RAISE EXCEPTION 'Receipt effect binding denied'; END IF;
      SELECT * INTO head FROM audit_chain_heads WHERE tenant_id=NEW.tenant_id FOR UPDATE;
      IF NOT FOUND OR NEW.sequence<>head.sequence+1 OR NEW.previous_hash<>head.receipt_hash THEN RAISE EXCEPTION 'Receipt chain allocation denied'; END IF;
      PERFORM m04_require_writer(NEW.run_id,NEW.tenant_id,effect.writer_epoch);
      RETURN NEW;
    END $func$;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_receipt_changes' AND tgrelid = 'audit_receipts'::regclass) THEN
    CREATE TRIGGER audit_receipt_changes BEFORE INSERT OR UPDATE OR DELETE ON audit_receipts FOR EACH ROW EXECUTE FUNCTION audit_receipt_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_receipt_truncate' AND tgrelid = 'audit_receipts'::regclass) THEN
    CREATE TRIGGER audit_receipt_truncate BEFORE TRUNCATE ON audit_receipts FOR EACH STATEMENT EXECUTE FUNCTION audit_receipt_guard();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_advance_head' AND pronamespace = current_schema()::regnamespace) THEN
    CREATE FUNCTION audit_advance_head() RETURNS trigger LANGUAGE plpgsql AS $func$
    BEGIN
      UPDATE audit_chain_heads SET sequence=NEW.sequence,receipt_hash=NEW.receipt_hash
      WHERE tenant_id=NEW.tenant_id AND sequence=NEW.sequence-1 AND receipt_hash=NEW.previous_hash;
      IF NOT FOUND THEN RAISE EXCEPTION 'Receipt chain allocation conflict'; END IF;
      RETURN NEW;
    END $func$;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_receipt_head' AND tgrelid = 'audit_receipts'::regclass) THEN
    CREATE TRIGGER audit_receipt_head AFTER INSERT ON audit_receipts FOR EACH ROW EXECUTE FUNCTION audit_advance_head();
  END IF;
END $$;
DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['audit_receipts','audit_chain_heads'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_tenant' AND tablename = relation) THEN
      EXECUTE format('CREATE POLICY audit_tenant ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))', relation);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', relation);
  END LOOP;
END $$;
