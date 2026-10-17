-- Approved Task07: canonical policy-owned approvals. No legacy authority is inferred.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM approvals LIMIT 1) THEN RAISE EXCEPTION 'Populated legacy approvals require a separately reviewed conversion'; END IF;
END $$;
ALTER TABLE effect_journal ADD CONSTRAINT policy_effect_identity UNIQUE(effect_id,tenant_id,run_id);
ALTER TABLE approvals ADD COLUMN writer_epoch bigint NOT NULL CHECK(writer_epoch BETWEEN 1 AND 9007199254740991);
ALTER TABLE approvals ADD COLUMN requester_principal_id text NOT NULL;
ALTER TABLE approvals ADD COLUMN requester_grant_id text NOT NULL;
ALTER TABLE approvals ADD COLUMN approver_grant_id text NOT NULL;
ALTER TABLE approvals ADD COLUMN request_json jsonb NOT NULL;
ALTER TABLE approvals ADD COLUMN decision_json jsonb;
ALTER TABLE approvals ADD COLUMN request_signature text NOT NULL;
ALTER TABLE approvals ADD COLUMN decision_signature text;
ALTER TABLE approvals ADD COLUMN consumed_at timestamptz;
ALTER TABLE approvals ADD CONSTRAINT policy_approval_run FOREIGN KEY(run_id,tenant_id) REFERENCES runs(run_id,tenant_id);
ALTER TABLE approvals ADD CONSTRAINT policy_approval_effect FOREIGN KEY(effect_id,tenant_id,run_id) REFERENCES effect_journal(effect_id,tenant_id,run_id);
ALTER TABLE approvals ADD CONSTRAINT policy_approval_hash CHECK(octet_length(input_hash)=32 AND (artifact_hash IS NULL OR octet_length(artifact_hash)=32));
ALTER TABLE approvals ADD CONSTRAINT policy_approval_bounds CHECK(jsonb_typeof(request_json)='object' AND octet_length(request_json::text)<=65536 AND request_signature~'^[a-f0-9]{64}$' AND length(requester_principal_id) BETWEEN 1 AND 128 AND length(requester_grant_id) BETWEEN 1 AND 128 AND length(approver_grant_id) BETWEEN 1 AND 128 AND length(approver_principal_id) BETWEEN 1 AND 128);
ALTER TABLE approvals ADD CONSTRAINT policy_approval_phase CHECK((decision IS NULL AND decision_json IS NULL AND decision_signature IS NULL AND decided_at IS NULL AND consumed_at IS NULL) OR (decision IS NOT NULL AND decision_json IS NOT NULL AND jsonb_typeof(decision_json)='object' AND octet_length(decision_json::text)<=65536 AND decision_signature IS NOT NULL AND decision_signature~'^[a-f0-9]{64}$' AND decided_at IS NOT NULL AND (consumed_at IS NULL OR decision='approve')));
CREATE INDEX policy_approval_scope ON approvals(tenant_id,run_id,created_at,approval_id);
CREATE FUNCTION p07_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Approval history is immutable'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.approval_id,NEW.tenant_id,NEW.run_id,NEW.effect_id,NEW.writer_epoch,NEW.requester_principal_id,NEW.requester_grant_id,NEW.approver_principal_id,NEW.approver_grant_id,NEW.policy_version,NEW.input_hash,NEW.artifact_hash,NEW.nonce,NEW.expires_at,NEW.request_json,NEW.request_signature,NEW.created_at)
  IS DISTINCT FROM (OLD.approval_id,OLD.tenant_id,OLD.run_id,OLD.effect_id,OLD.writer_epoch,OLD.requester_principal_id,OLD.requester_grant_id,OLD.approver_principal_id,OLD.approver_grant_id,OLD.policy_version,OLD.input_hash,OLD.artifact_hash,OLD.nonce,OLD.expires_at,OLD.request_json,OLD.request_signature,OLD.created_at) THEN RAISE EXCEPTION 'Approval intent is immutable'; END IF;
  IF OLD.decision IS NOT NULL AND (NEW.decision,NEW.decision_json,NEW.decision_signature,NEW.decided_at) IS DISTINCT FROM (OLD.decision,OLD.decision_json,OLD.decision_signature,OLD.decided_at) THEN RAISE EXCEPTION 'Approval decision is immutable'; END IF;
  IF OLD.consumed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Approval consumption is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER policy_approval_guard BEFORE UPDATE OR DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION p07_guard();

CREATE FUNCTION p07_writer(ctx jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM b06_writer(ctx);
 IF NOT EXISTS (SELECT 1 FROM sessions WHERE session_id=ctx->>'sessionId' AND tenant_id=current_setting('asi.tenant_id',true) AND writer_epoch=(ctx->>'writerEpoch')::bigint AND mode=ctx->>'mode') THEN RAISE EXCEPTION 'Stale policy session epoch or mode'; END IF;
END $$;
CREATE FUNCTION p07_check(ctx jsonb,req jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE e effect_journal%ROWTYPE; tenant text:=current_setting('asi.tenant_id',true);
BEGIN
 PERFORM p07_writer(ctx);
 SELECT * INTO e FROM effect_journal WHERE effect_id=req->>'effectId' AND tenant_id=tenant AND run_id=ctx->>'runId';
 IF NOT FOUND OR e.writer_epoch IS DISTINCT FROM (ctx->>'writerEpoch')::bigint OR e.action IS DISTINCT FROM req->>'action' OR e.resource IS DISTINCT FROM req->>'resource' OR encode(e.input_hash,'hex') IS DISTINCT FROM req->>'inputHash' OR encode(e.artifact_hash,'hex') IS DISTINCT FROM req->>'artifactHash' OR e.idempotency_key IS DISTINCT FROM req->>'idempotencyKey' OR e.intent_json IS DISTINCT FROM req OR req->'runContext' IS DISTINCT FROM ctx THEN RAISE EXCEPTION 'Policy effect intent binding mismatch'; END IF;
 PERFORM m04_require_writer(ctx->>'runId',tenant,(ctx->>'writerEpoch')::bigint);
END $$;
CREATE FUNCTION p07_authorize(ctx jsonb,req jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 PERFORM p07_check(ctx,req);
 UPDATE effect_journal SET status='authorized',authorized_at=clock_timestamp() WHERE effect_id=req->>'effectId' AND tenant_id=current_setting('asi.tenant_id',true) AND run_id=ctx->>'runId' AND status='planned';
 IF NOT FOUND THEN RAISE EXCEPTION 'Effect is not awaiting authorization'; END IF;
 PERFORM m04_require_writer(ctx->>'runId',current_setting('asi.tenant_id',true),(ctx->>'writerEpoch')::bigint);
END $$;
CREATE FUNCTION p07_create(ctx jsonb,req jsonb,intent jsonb,signature text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE a approvals%ROWTYPE; tenant text:=current_setting('asi.tenant_id',true); expires timestamptz:=(intent->>'expiresAt')::timestamptz;
BEGIN
 PERFORM p07_check(ctx,req);
 IF intent->'request' IS DISTINCT FROM req OR intent->'requester'->'principal'->>'tenantId' IS DISTINCT FROM tenant OR intent->'approver'->'principal'->>'tenantId' IS DISTINCT FROM tenant OR expires<=clock_timestamp() OR expires>(ctx->>'deadlineAt')::timestamptz OR expires>clock_timestamp()+interval '5 minutes' OR expires>(intent->'requester'->'principal'->>'expiresAt')::timestamptz OR expires>(intent->'approver'->'principal'->>'expiresAt')::timestamptz THEN RAISE EXCEPTION 'Invalid bound approval intent'; END IF;
 INSERT INTO approvals(approval_id,tenant_id,run_id,effect_id,writer_epoch,requester_principal_id,requester_grant_id,approver_principal_id,approver_grant_id,policy_version,input_hash,artifact_hash,nonce,expires_at,request_json,request_signature)
 VALUES(intent->>'approvalId',tenant,ctx->>'runId',req->>'effectId',(ctx->>'writerEpoch')::bigint,intent->'requester'->'principal'->>'subjectId',intent->'requester'->>'grantId',intent->'approver'->'principal'->>'subjectId',intent->'approver'->>'grantId',intent->>'policyVersion',decode(req->>'inputHash','hex'),decode(req->>'artifactHash','hex'),intent->>'nonce',expires,intent,signature) RETURNING * INTO a;
 RETURN to_jsonb(a);
END $$;
CREATE FUNCTION p07_decide(ctx jsonb,id text,nonce_value text,decision_value jsonb,signature text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE a approvals%ROWTYPE; tenant text:=current_setting('asi.tenant_id',true);
BEGIN
 SELECT * INTO a FROM approvals WHERE approval_id=id AND tenant_id=tenant AND run_id=ctx->>'runId';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown approval'; END IF;
 PERFORM p07_check(ctx,a.request_json->'request');
 SELECT * INTO a FROM approvals WHERE approval_id=id AND tenant_id=tenant FOR UPDATE;
 PERFORM m04_require_writer(ctx->>'runId',tenant,(ctx->>'writerEpoch')::bigint);
 IF a.writer_epoch IS DISTINCT FROM (ctx->>'writerEpoch')::bigint OR a.decision IS NOT NULL OR a.expires_at<=clock_timestamp() OR a.nonce IS DISTINCT FROM nonce_value OR decision_value->>'nonce' IS DISTINCT FROM a.nonce OR decision_value->>'approvalId' IS DISTINCT FROM a.approval_id OR decision_value->>'requestSignature' IS DISTINCT FROM a.request_signature OR decision_value->'actor'->>'grantId' IS DISTINCT FROM a.approver_grant_id OR decision_value->'actor'->'principal' IS DISTINCT FROM a.request_json->'approver'->'principal' OR decision_value->>'decision' NOT IN ('approve','reject') OR (decision_value->>'decidedAt')::timestamptz>clock_timestamp() OR (decision_value->'actor'->'principal'->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'Invalid approval decision, actor, nonce or expiry'; END IF;
 UPDATE approvals SET decision=decision_value->>'decision',decision_json=decision_value,decision_signature=signature,decided_at=(decision_value->>'decidedAt')::timestamptz WHERE approval_id=id AND tenant_id=tenant RETURNING * INTO a;
 RETURN to_jsonb(a);
END $$;
CREATE FUNCTION p07_grant(id text,actor jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g identity_grants%ROWTYPE; leaf identity_grants%ROWTYPE; current_id text:=id; seen text[]:='{}'; child_claims jsonb;
BEGIN
 LOOP
  IF current_id=ANY(seen) OR cardinality(seen)>=17 THEN RAISE EXCEPTION 'Invalid approval grant ancestry'; END IF;
  seen:=seen||current_id;
  SELECT * INTO g FROM identity_grants WHERE grant_id=current_id FOR SHARE;
  IF NOT FOUND OR g.deleted OR g.revoked_at IS NOT NULL OR g.tenant_id IS DISTINCT FROM current_setting('asi.tenant_id',true) OR (g.claims->>'expiresAt')::numeric<=extract(epoch FROM clock_timestamp()) OR (g.claims->>'issuedAt')::numeric>extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'Approval authorization grant unavailable'; END IF;
  IF child_claims IS NOT NULL AND ((child_claims->>'expiresAt')::numeric>(g.claims->>'expiresAt')::numeric OR NOT (child_claims->'capabilities') <@ (g.claims->'capabilities')) THEN RAISE EXCEPTION 'Invalid delegated approval scope'; END IF;
  IF cardinality(seen)=1 THEN leaf:=g; END IF;
  EXIT WHEN g.parent_grant_id IS NULL;
  child_claims:=g.claims;current_id:=g.parent_grant_id;
 END LOOP;
 IF leaf.claims->>'subjectId' IS DISTINCT FROM actor->>'subjectId' OR leaf.claims->>'tenantId' IS DISTINCT FROM actor->>'tenantId' OR leaf.claims->>'audience' IS DISTINCT FROM actor->>'audience' OR leaf.claims->'roles' IS DISTINCT FROM actor->'roles' OR leaf.claims->'capabilities' IS DISTINCT FROM actor->'capabilities' OR leaf.claims->>'agentId' IS DISTINCT FROM actor->>'agentId' OR (leaf.claims->>'expiresAt')::numeric IS DISTINCT FROM extract(epoch FROM (actor->>'expiresAt')::timestamptz) THEN RAISE EXCEPTION 'Approval grant identity mismatch'; END IF;
END $$;
CREATE FUNCTION p07_bind(ctx jsonb,actors jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor jsonb;
BEGIN
 PERFORM p07_writer(ctx);
 IF jsonb_typeof(actors) IS DISTINCT FROM 'array' OR jsonb_array_length(actors) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Bounded authenticated actors required'; END IF;
 FOR actor IN SELECT value FROM jsonb_array_elements(actors) LOOP
  PERFORM p07_grant(actor->>'grantId',actor->'principal');
 END LOOP;
END $$;
CREATE FUNCTION p07_requester(ctx jsonb,actor jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 PERFORM p07_bind(ctx,jsonb_build_array(actor));
 IF NOT EXISTS (WITH RECURSIVE ancestry AS (
  SELECT grant_id,parent_grant_id,claims,1 AS depth FROM identity_grants WHERE grant_id=actor->>'grantId'
  UNION ALL SELECT g.grant_id,g.parent_grant_id,g.claims,a.depth+1 FROM identity_grants g JOIN ancestry a ON g.grant_id=a.parent_grant_id WHERE a.depth<17
 ) SELECT 1 FROM ancestry a JOIN sessions s ON s.principal_id=a.claims->>'subjectId' WHERE s.session_id=ctx->>'sessionId' AND s.tenant_id=current_setting('asi.tenant_id',true)) THEN RAISE EXCEPTION 'Policy requester does not own this conversation'; END IF;
END $$;
CREATE FUNCTION p07_consume(ctx jsonb,req jsonb,id text,nonce_value text,signature text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE a approvals%ROWTYPE; tenant text:=current_setting('asi.tenant_id',true);
BEGIN
 PERFORM p07_check(ctx,req);
 SELECT * INTO a FROM approvals WHERE approval_id=id AND tenant_id=tenant AND run_id=ctx->>'runId' FOR UPDATE;
 PERFORM m04_require_writer(ctx->>'runId',tenant,(ctx->>'writerEpoch')::bigint);
 IF NOT FOUND OR a.decision IS DISTINCT FROM 'approve' OR a.consumed_at IS NOT NULL OR a.expires_at<=clock_timestamp() OR a.nonce IS DISTINCT FROM nonce_value OR a.request_json->'request' IS DISTINCT FROM req OR a.decision_signature IS DISTINCT FROM signature THEN RAISE EXCEPTION 'Approval unavailable for this exact effect'; END IF;
 PERFORM p07_grant(a.requester_grant_id,a.request_json->'requester'->'principal');
 PERFORM p07_grant(a.approver_grant_id,a.request_json->'approver'->'principal');
 UPDATE effect_journal SET status='authorized',authorized_at=clock_timestamp() WHERE effect_id=a.effect_id AND tenant_id=tenant AND run_id=a.run_id AND status='planned';
 IF NOT FOUND THEN RAISE EXCEPTION 'Effect is not awaiting authorization'; END IF;
 UPDATE approvals SET consumed_at=clock_timestamp() WHERE approval_id=id AND tenant_id=tenant RETURNING * INTO a;
 RETURN to_jsonb(a);
END $$;
CREATE FUNCTION p07_get(ctx jsonb,id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 PERFORM p07_writer(ctx);
 SELECT to_jsonb(a) INTO result FROM approvals a WHERE a.approval_id=id AND a.tenant_id=current_setting('asi.tenant_id',true) AND a.run_id=ctx->>'runId' AND a.writer_epoch=(ctx->>'writerEpoch')::bigint;
 RETURN result;
END $$;
CREATE FUNCTION p07_list(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
 PERFORM p07_writer(ctx);
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) INTO result FROM (SELECT * FROM approvals WHERE tenant_id=current_setting('asi.tenant_id',true) AND run_id=ctx->>'runId' AND writer_epoch=(ctx->>'writerEpoch')::bigint AND decision IS NULL AND expires_at>clock_timestamp() ORDER BY created_at,approval_id LIMIT 101) a;
 IF jsonb_array_length(result)>100 THEN RAISE EXCEPTION 'Approval list exceeds bounded response'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION p07_expire(ctx jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 -- Expired status is derived from the immutable expiry; no synthetic human decision is manufactured.
 PERFORM p07_writer(ctx);
 RETURN 0;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS identity FROM pg_proc p WHERE p.pronamespace=current_schema()::regnamespace AND p.proname LIKE 'p07_%' LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path=%I,pg_temp',f.identity,current_schema());
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.identity);
 END LOOP;
END $$;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON approvals;
CREATE POLICY policy_approval_tenant ON approvals USING(tenant_id=current_setting('asi.tenant_id',true)) WITH CHECK(tenant_id=current_setting('asi.tenant_id',true));
REVOKE ALL ON approvals FROM PUBLIC;
