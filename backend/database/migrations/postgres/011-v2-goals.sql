-- V2-T01 reviewed forward migration. 001/009/010 remain immutable prerequisites.
-- Apply transactionally through the explicit migration runner, never by numeric glob.
CREATE TABLE goals (
 goal_id text NOT NULL,
 tenant_id text NOT NULL,
 revision integer NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 status text NOT NULL CHECK (status IN ('draft','ready','running','waiting_input','waiting_approval','suspended','verified','unmet','cancelled','failed')),
 conversation_id text NOT NULL,
 objective text NOT NULL,
 deadline_at timestamptz NOT NULL,
 owning_run_id text,
 latest_verification_ref text,
 record_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (goal_id, revision),
 CONSTRAINT goal_identity UNIQUE (goal_id, tenant_id, revision),
 CONSTRAINT goal_record_binding CHECK (
  record_json->>'goalId'=goal_id AND record_json->>'tenantId'=tenant_id AND record_json->>'revision'=revision::text
  AND record_json->>'conversationId'=conversation_id AND record_json->>'objective'=objective
  AND coalesce(record_json->>'owningRunId','')=coalesce(owning_run_id,'')),
 CONSTRAINT goal_run_scope FOREIGN KEY (owning_run_id, tenant_id) REFERENCES runs(run_id, tenant_id)
);
CREATE TABLE goal_transitions (
 transition_id text PRIMARY KEY,
 goal_id text NOT NULL,
 tenant_id text NOT NULL,
 revision integer NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 from_status text NOT NULL,
 to_status text NOT NULL,
 verification_ref text,
 transitioned_at timestamptz NOT NULL,
 transition_json jsonb NOT NULL,
 CONSTRAINT goal_transition_binding CHECK (
  transition_json->>'transitionId'=transition_id AND transition_json->>'goalId'=goal_id
  AND transition_json->>'goalRevision'=revision::text
  AND transition_json->>'fromStatus'=from_status AND transition_json->>'toStatus'=to_status),
 CONSTRAINT goal_transition_scope FOREIGN KEY (goal_id, tenant_id, revision) REFERENCES goals(goal_id, tenant_id, revision)
);
CREATE TABLE goal_progress (
 progress_id text PRIMARY KEY,
 goal_id text NOT NULL,
 tenant_id text NOT NULL,
 revision integer NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 measured_at timestamptz NOT NULL,
 display_status text NOT NULL CHECK (display_status IN ('achieved','on_track','unmet','unknown')),
 report_json jsonb NOT NULL,
 CONSTRAINT goal_progress_binding CHECK (
  report_json->>'progressId'=progress_id AND report_json->>'goalId'=goal_id
  AND report_json->>'goalRevision'=revision::text AND report_json->>'displayStatus'=display_status),
 CONSTRAINT goal_progress_scope FOREIGN KEY (goal_id, tenant_id, revision) REFERENCES goals(goal_id, tenant_id, revision)
);

CREATE FUNCTION v2_goal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Goal history is immutable'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.record_json IS DISTINCT FROM OLD.record_json
   OR (NEW.goal_id,NEW.tenant_id,NEW.revision,NEW.conversation_id,NEW.objective,NEW.deadline_at,NEW.owning_run_id)
      IS DISTINCT FROM (OLD.goal_id,OLD.tenant_id,OLD.revision,OLD.conversation_id,OLD.objective,OLD.deadline_at,OLD.owning_run_id) THEN
   RAISE EXCEPTION 'Goal identity is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT EXISTS (SELECT 1 FROM goal_transitions t
      WHERE t.goal_id=NEW.goal_id AND t.tenant_id=NEW.tenant_id AND t.revision=NEW.revision
      AND t.from_status=OLD.status AND t.to_status=NEW.status) THEN
   RAISE EXCEPTION 'Goal status change requires a recorded transition';
  END IF;
  IF NEW.status='verified' AND NEW.latest_verification_ref IS NULL THEN
   RAISE EXCEPTION 'A verified goal requires a verification reference';
  END IF;
 ELSE
  IF NEW.owning_run_id IS NOT NULL THEN
   PERFORM m04_require_writer(NEW.owning_run_id,NEW.tenant_id,
    (SELECT writer_epoch FROM runs WHERE run_id=NEW.owning_run_id AND tenant_id=NEW.tenant_id));
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goal_history_guard BEFORE INSERT OR UPDATE OR DELETE ON goals FOR EACH ROW EXECUTE FUNCTION v2_goal_guard();

CREATE FUNCTION v2_goal_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Goal transitions are immutable'; END IF;
 IF (SELECT status FROM goals WHERE goal_id=NEW.goal_id AND tenant_id=NEW.tenant_id AND revision=NEW.revision) IS DISTINCT FROM NEW.from_status THEN
  RAISE EXCEPTION 'Transition from_status does not match the stored goal status';
 END IF;
 PERFORM m04_require_writer(NEW.transition_json->>'by',NEW.tenant_id,
  (SELECT writer_epoch FROM runs WHERE run_id=NEW.transition_json->>'by' AND tenant_id=NEW.tenant_id));
 RETURN NEW;
END $$;
CREATE TRIGGER goal_transition_guard BEFORE INSERT OR UPDATE OR DELETE ON goal_transitions FOR EACH ROW EXECUTE FUNCTION v2_goal_transition_guard();

CREATE FUNCTION v2_goal_progress_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Goal progress is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER goal_progress_guard BEFORE INSERT OR UPDATE OR DELETE ON goal_progress FOR EACH ROW EXECUTE FUNCTION v2_goal_progress_guard();

DO $$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['goals','goal_transitions','goal_progress'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY authenticated_tenant ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))',relation);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation);
 END LOOP;
END $$;
