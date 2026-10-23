-- Stage 06 Migration 012: Operator-allowlisted OpenAI-compatible provider transport.
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/05-API-CONTRACTS.md,
-- docs/backend/08-SECURITY-AND-RUNTIME.md, docs/backend/09-PROVIDERS-AND-MEMORY.md,
-- docs/backend/11-IMPLEMENTATION-ROADMAP.md

ALTER TABLE inference.provider_connections DROP CONSTRAINT provider_connections_kind_check;
ALTER TABLE inference.provider_connections ADD CONSTRAINT provider_connections_kind_check
    CHECK (kind IN ('openai','openai_compatible'));

ALTER TABLE inference.provider_connections DROP CONSTRAINT provider_connections_endpoint_policy_check;
ALTER TABLE inference.provider_connections ADD CONSTRAINT provider_connections_endpoint_policy_check CHECK (
    jsonb_typeof(endpoint_policy) = 'object'
    AND octet_length(endpoint_policy::text) <= 4096
    AND (
        (kind = 'openai' AND endpoint_policy->>'baseUrl' = 'https://api.openai.com/v1')
        OR (
            kind = 'openai_compatible'
            AND endpoint_policy->>'baseUrl' ~ '^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?/v1$'
        )
    )
);
