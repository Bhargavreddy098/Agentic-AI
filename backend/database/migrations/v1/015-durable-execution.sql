-- Stage 07 expand-only durable execution. No rows are seeded; public execution start stays gated.
CREATE TABLE control.runs (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, project_id uuid NOT NULL, goal_id uuid NOT NULL,
 contract_revision_id uuid NOT NULL, plan_revision_id uuid NOT NULL, policy_revision_id uuid NOT NULL,
 repository_snapshot_id uuid NOT NULL, owner_principal_id uuid NOT NULL, owner_session_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','executing','awaiting_effect_approval','paused','verifying','repairing','blocked','cancelling','verified','failed','cancelled')),
 autonomy_mode text NOT NULL CHECK(autonomy_mode IN ('plan_only','ask_before_every_change','autonomous_coding','full_autonomous_build')),
 epoch bigint NOT NULL DEFAULT 1 CHECK(epoch>0), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 deadline_at timestamptz NOT NULL, cancel_requested_at timestamptz, pause_requested_at timestamptz,
 last_checkpoint_id uuid, supersedes_run_id uuid, next_event_sequence bigint NOT NULL DEFAULT 1 CHECK(next_event_sequence>0),
 retained_after bigint NOT NULL DEFAULT 0 CHECK(retained_after>=0), blockers jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(blockers)='array' AND octet_length(blockers::text)<=8192),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,goal_id) REFERENCES product.goals(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,contract_revision_id) REFERENCES planning.contract_revisions(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,plan_revision_id) REFERENCES planning.plan_revisions(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,policy_revision_id) REFERENCES control.policy_revisions(workspace_id,id),
 FOREIGN KEY(workspace_id,project_id,repository_snapshot_id) REFERENCES product.repository_snapshots(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,owner_principal_id) REFERENCES identity.workspaces(workspace_id,owner_principal_id),
 FOREIGN KEY(owner_session_id) REFERENCES identity.sessions(session_id),
 FOREIGN KEY(workspace_id,project_id,supersedes_run_id) REFERENCES control.runs(workspace_id,project_id,id)
);
CREATE INDEX runs_project_state ON control.runs(workspace_id,project_id,state,id);
CREATE TABLE control.tasks (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, project_id uuid NOT NULL, run_id uuid NOT NULL,
 plan_revision_id uuid NOT NULL, plan_step_id uuid NOT NULL, step_key text NOT NULL CHECK(length(step_key) BETWEEN 1 AND 128),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','blocked','cancelling','cancelled','unknown')),
 priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN -100 AND 100), available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0), max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 3),
 deadline_at timestamptz NOT NULL, lease_owner uuid, lease_expires_at timestamptz, lease_epoch bigint NOT NULL DEFAULT 0 CHECK(lease_epoch>=0),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 256),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,project_id,run_id,id), UNIQUE(run_id,plan_step_id), UNIQUE(workspace_id,idempotency_key),
 FOREIGN KEY(workspace_id,project_id,run_id) REFERENCES control.runs(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,plan_revision_id,plan_step_id) REFERENCES planning.plan_steps(workspace_id,project_id,plan_revision_id,id),
 CHECK((state='running')=(lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX tasks_ready ON control.tasks(available_at,priority DESC,id) WHERE state='queued';
CREATE INDEX tasks_expired ON control.tasks(lease_expires_at) WHERE state='running';
CREATE INDEX tasks_run_state ON control.tasks(workspace_id,project_id,run_id,state);
CREATE TABLE control.task_dependencies (
 workspace_id uuid NOT NULL, project_id uuid NOT NULL, run_id uuid NOT NULL, task_id uuid NOT NULL, requires_task_id uuid NOT NULL,
 PRIMARY KEY(workspace_id,run_id,task_id,requires_task_id), CHECK(task_id<>requires_task_id),
 FOREIGN KEY(workspace_id,project_id,run_id,task_id) REFERENCES control.tasks(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,requires_task_id) REFERENCES control.tasks(workspace_id,project_id,run_id,id)
);
CREATE TABLE inference.tool_definitions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES identity.workspaces(workspace_id),name text NOT NULL,revision text NOT NULL,
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=65536),
 digest bytea NOT NULL CHECK(octet_length(digest)=32),qualified_at timestamptz,revoked_at timestamptz,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,name,revision)
);
CREATE TABLE control.effects (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,run_id uuid NOT NULL,task_id uuid NOT NULL,tool_id uuid NOT NULL,
 operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 256),input_digest bytea NOT NULL CHECK(octet_length(input_digest)=32),
 target_ref text NOT NULL CHECK(length(target_ref) BETWEEN 1 AND 1024),risk text NOT NULL CHECK(risk IN ('read','write','high')),
 state text NOT NULL CHECK(state IN ('prepared','dispatched','succeeded','failed','unknown','reconciled')),
 approval_id uuid,receipt_ref uuid,external_operation_id text CHECK(length(external_operation_id)<=1024),
 dispatch_epoch bigint,task_epoch bigint,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,operation_key),UNIQUE(workspace_id,project_id,run_id,id),UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,task_id) REFERENCES control.tasks(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,tool_id) REFERENCES inference.tool_definitions(workspace_id,id),
 FOREIGN KEY(workspace_id,approval_id) REFERENCES control.approvals(workspace_id,id),
 FOREIGN KEY(workspace_id,project_id,receipt_ref) REFERENCES product.artifacts(workspace_id,project_id,id)
);
CREATE INDEX effects_run_state ON control.effects(workspace_id,run_id,state);
CREATE TABLE control.checkpoints (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,run_id uuid NOT NULL,
 epoch bigint NOT NULL CHECK(epoch>0),sequence bigint NOT NULL CHECK(sequence>0),schema_version integer NOT NULL CHECK(schema_version=1),
 state_digest bytea NOT NULL CHECK(octet_length(state_digest)=32),state_ref jsonb NOT NULL CHECK(jsonb_typeof(state_ref)='object' AND octet_length(state_ref::text)<=1048576),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(run_id,sequence),UNIQUE(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id) REFERENCES control.runs(workspace_id,project_id,id)
);
ALTER TABLE control.runs ADD FOREIGN KEY(workspace_id,project_id,id,last_checkpoint_id) REFERENCES control.checkpoints(workspace_id,project_id,run_id,id);
CREATE TRIGGER checkpoints_immutable BEFORE UPDATE OR DELETE ON control.checkpoints FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TABLE control.run_events (
 workspace_id uuid NOT NULL,project_id uuid NOT NULL,run_id uuid NOT NULL,sequence bigint NOT NULL CHECK(sequence>0),
 event_id uuid NOT NULL UNIQUE,type text NOT NULL CHECK(type IN ('run.state_changed','task.state_changed','approval.requested','artifact.available','verification.completed','usage.updated','run.blocked')),
 safe_payload jsonb NOT NULL CHECK(jsonb_typeof(safe_payload)='object' AND octet_length(safe_payload::text)<=8192),trace_id text NOT NULL CHECK(length(trace_id) BETWEEN 1 AND 128),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(run_id,sequence),
 FOREIGN KEY(workspace_id,project_id,run_id) REFERENCES control.runs(workspace_id,project_id,id)
);
CREATE TABLE control.failures (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,run_id uuid NOT NULL,task_id uuid,
 class text NOT NULL CHECK(length(class) BETWEEN 1 AND 128),fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
 safe_detail text NOT NULL CHECK(length(safe_detail)<=4096),repair_attempt integer NOT NULL DEFAULT 0 CHECK(repair_attempt BETWEEN 0 AND 3),hypothesis_ref uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(workspace_id,project_id,run_id) REFERENCES control.runs(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,task_id) REFERENCES control.tasks(workspace_id,project_id,run_id,id)
);
-- Stage 07 agent projections retain scoped context/grant identity. Generation remains later-stage.
CREATE TABLE knowledge.context_bundles (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,run_id uuid NOT NULL,task_id uuid NOT NULL,
 digest bytea NOT NULL CHECK(octet_length(digest)=32),source_revision_refs jsonb NOT NULL CHECK(jsonb_typeof(source_revision_refs)='array'),
 token_estimate integer NOT NULL CHECK(token_estimate>=0),classification text NOT NULL CHECK(classification IN ('public','internal')),content_ref uuid NOT NULL,
 UNIQUE(workspace_id,project_id,run_id,task_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,task_id) REFERENCES control.tasks(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,project_id,content_ref) REFERENCES product.artifacts(workspace_id,project_id,id)
);
CREATE TABLE control.agent_sessions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,project_id uuid NOT NULL,run_id uuid NOT NULL,task_id uuid NOT NULL,
 role text NOT NULL CHECK(length(role) BETWEEN 1 AND 128),parent_session_id uuid,context_bundle_id uuid NOT NULL,capability_grant_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled','blocked')),deadline_at timestamptz NOT NULL,
 usage_summary jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(usage_summary)='object'),
 UNIQUE(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,task_id) REFERENCES control.tasks(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,parent_session_id) REFERENCES control.agent_sessions(workspace_id,project_id,run_id,id),
 FOREIGN KEY(workspace_id,project_id,run_id,task_id,context_bundle_id) REFERENCES knowledge.context_bundles(workspace_id,project_id,run_id,task_id,id),
 FOREIGN KEY(workspace_id,project_id,capability_grant_id) REFERENCES control.capability_grants(workspace_id,project_id,id)
);
ALTER TABLE control.outbox ADD COLUMN lease_owner uuid, ADD COLUMN lease_epoch bigint NOT NULL DEFAULT 0 CHECK(lease_epoch>=0),ADD COLUMN lease_expires_at timestamptz;
CREATE OR REPLACE FUNCTION control.guard_run_pins() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.workspace_id,NEW.project_id,NEW.goal_id,NEW.contract_revision_id,NEW.plan_revision_id,NEW.policy_revision_id,NEW.repository_snapshot_id,NEW.owner_principal_id,NEW.owner_session_id,NEW.autonomy_mode)
 IS DISTINCT FROM ROW(OLD.workspace_id,OLD.project_id,OLD.goal_id,OLD.contract_revision_id,OLD.plan_revision_id,OLD.policy_revision_id,OLD.repository_snapshot_id,OLD.owner_principal_id,OLD.owner_session_id,OLD.autonomy_mode)
 THEN RAISE EXCEPTION 'immutable run authorization pins'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER run_pins BEFORE UPDATE ON control.runs FOR EACH ROW EXECUTE FUNCTION control.guard_run_pins();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['control.runs','control.tasks','control.task_dependencies','inference.tool_definitions','control.effects','control.checkpoints','control.run_events','control.failures','knowledge.context_bundles','control.agent_sessions'] LOOP
 EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',table_name);
 EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',table_name);
 EXECUTE format('CREATE POLICY workspace_scope ON %s USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())',table_name);
 END LOOP;
END $$;
ALTER TABLE control.operations DROP CONSTRAINT operations_kind_check;
ALTER TABLE control.operations ADD CONSTRAINT operations_kind_check CHECK(kind IN ('upload.complete','snapshot.create','artifact.export','provider.discovery','provider.probe','effect.reconcile'));
ALTER TABLE control.operations DROP CONSTRAINT operations_result_type_check;
ALTER TABLE control.operations ADD CONSTRAINT operations_result_type_check CHECK(result_type IS NULL OR result_type IN ('artifact','repository_snapshot','provider','model','effect'));
ALTER TABLE control.operations ADD COLUMN effect_id uuid;
ALTER TABLE control.operations ADD FOREIGN KEY(workspace_id,effect_id) REFERENCES control.effects(workspace_id,id);
ALTER TABLE control.operations ADD CONSTRAINT reconciliation_effect_scope CHECK((kind='effect.reconcile')=(effect_id IS NOT NULL));
ALTER TABLE control.tasks ADD CHECK((lease_owner IS NULL)=(lease_expires_at IS NULL));
CREATE OR REPLACE FUNCTION control.guard_tool_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.workspace_id,NEW.id,NEW.name,NEW.revision,NEW.manifest,NEW.digest,NEW.qualified_at) IS DISTINCT FROM ROW(OLD.workspace_id,OLD.id,OLD.name,OLD.revision,OLD.manifest,OLD.digest,OLD.qualified_at) THEN RAISE EXCEPTION 'immutable qualified tool revision';END IF;RETURN NEW;
END $$;
CREATE TRIGGER tool_revision_pins BEFORE UPDATE ON inference.tool_definitions FOR EACH ROW EXECUTE FUNCTION control.guard_tool_revision();
-- Dispatcher may validate a pinned session without obtaining its cookie/hash. The
-- SELECT policy applies only to the migration owner used by this definer, never
-- to runtime; the runtime's existing token-hash RLS remains unchanged.
CREATE POLICY session_dispatch_validation ON identity.sessions FOR SELECT TO CURRENT_USER
 USING(workspace_id=ops.current_workspace_id() AND principal_id=NULLIF(current_setting('asi.principal_id',true),'')::uuid);
CREATE FUNCTION control.session_valid(session_ref uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp SET row_security=on AS $$
 SELECT EXISTS(SELECT 1 FROM identity.sessions s WHERE s.session_id=session_ref AND s.workspace_id=ops.current_workspace_id()
 AND s.principal_id=NULLIF(current_setting('asi.principal_id',true),'')::uuid AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.idle_expires_at>clock_timestamp());
$$;
ALTER TABLE identity.sessions ADD CONSTRAINT session_owner_reference UNIQUE(workspace_id,principal_id,session_id);
ALTER TABLE control.runs ADD CONSTRAINT run_session_owner_reference FOREIGN KEY(workspace_id,owner_principal_id,owner_session_id) REFERENCES identity.sessions(workspace_id,principal_id,session_id);
