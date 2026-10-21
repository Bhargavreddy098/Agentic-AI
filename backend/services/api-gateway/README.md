# `@asi/service-api-gateway` (Port 4400)

Public API Gateway microservice owning `/api/ui/v1` transport, session/CSRF/origin handling, safe projections, SSE replay, upload quarantine, and channel adapters. Communicates with Core, Memory, Episode, Inference, Orchestrator, Tool Runtime, and Specialist via typed HTTP clients without holding database or provider credentials.
