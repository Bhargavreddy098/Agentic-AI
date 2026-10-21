# 0005: Consolidate the backend and use Express

Status: approved by the user, 2026-10-21.

The ASI backend now has a root `backend/` workspace package with JavaScript ES module routing, controllers, schemas, services, models, middleware, configuration and `server.js`. Nineteen existing TypeScript domain packages move to `backend/modules`; eight worker packages move to `backend/workers`. Their package identities and process boundaries remain unchanged. `backend/RELOCATION.json` records the mapping. Shared contracts and frontend code stay outside the backend.

Native Express routers preserve the `/api/ui/v1` transport contracts using injectable existing owners. The legacy Hono application remains for explicit comparison/demo consumers. PostgreSQL uses a bounded `pg` pool; `pgvector` serializes vectors; migrations stay explicit and byte-identical. Existing SQLite authority is preserved. No ORM, user RBAC, production data migration, provider credentials, or synthetic-to-live promotion is introduced.

Architecture scanners recognize both the new production paths and historical fixture paths. The JavaScript backend has checkJs verification and native HTTP tests in root verification. Exact dependencies are recorded in the dependency inventory. HTTP controllers receive domain ports rather than a shared database pool.

The default composition remains unavailable for product operations until real authentication and durable owner ports are configured. PostgreSQL readiness is separate from product capabilities. Missing pgvector is a readiness failure, with no runtime DDL fallback.
