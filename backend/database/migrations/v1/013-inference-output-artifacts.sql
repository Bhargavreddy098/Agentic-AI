-- Stage 06: bind durable model output to its exact scoped encrypted artifact.
-- Expand-only: earlier calls remain readable; no historical outputs are invented.
ALTER TABLE inference.model_calls ADD COLUMN output_artifact_id uuid;
ALTER TABLE inference.model_calls ADD CONSTRAINT model_call_output_scope
    CHECK (output_artifact_id IS NULL OR project_id IS NOT NULL);
ALTER TABLE inference.model_calls ADD CONSTRAINT model_call_output_artifact_fk
    FOREIGN KEY (workspace_id, project_id, output_artifact_id)
    REFERENCES product.artifacts(workspace_id, project_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_model_call_output ON inference.model_calls(workspace_id, project_id, output_artifact_id)
    WHERE output_artifact_id IS NOT NULL;
CREATE FUNCTION inference.protect_model_output() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
        OR (OLD.output_artifact_id IS NOT NULL AND NEW.output_artifact_id IS DISTINCT FROM OLD.output_artifact_id)
        OR (OLD.state IN ('succeeded','failed','cancelled') AND
            ROW(NEW.usage,NEW.actual_micro_usd,NEW.external_request_id,NEW.output_artifact_id,NEW.routing_decision)
            IS DISTINCT FROM ROW(OLD.usage,OLD.actual_micro_usd,OLD.external_request_id,OLD.output_artifact_id,OLD.routing_decision)) THEN
        RAISE EXCEPTION 'Model output evidence is immutable';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER model_output_immutable BEFORE UPDATE ON inference.model_calls
    FOR EACH ROW EXECUTE FUNCTION inference.protect_model_output();
