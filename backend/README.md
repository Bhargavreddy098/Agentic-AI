# ASI backend

The Node.js Express entry is `server.js`. Existing domain modules and isolated workers retain their TypeScript implementation and package names. Shared contracts remain in `packages/contracts`; frontend source remains outside this folder.

```text
backend/
  server.js            HTTP listener and shutdown
  app.js               Injectable Express application
  config/              Environment, logging, PostgreSQL pool
  routes/              Versioned HTTP routing and parser ordering
  controllers/         Contract validation and HTTP responses
  schemas/             Shared contract exports
  services/            Existing domain port adapters
  models/              Scoped vector repository helper
  middlewares/         Sessions, origin/CSRF, limits, errors
  database/            Transaction helper, migration runner and SQL
  modules/             19 existing backend packages
  workers/             8 existing isolated worker applications
  tests/               Native HTTP, security, database and lifecycle tests
```

From the repository root, using Node 24.19.0 and pnpm 12.6.0:

```powershell
pnpm install --frozen-lockfile
pnpm backend:build
Copy-Item backend/.env.example backend/.env
# Set DATABASE_URL in backend/.env to your PostgreSQL database.
pnpm backend:dev
# Or, after building:
pnpm backend:start
pnpm backend:typecheck
pnpm backend:test
```

The listener defaults to `127.0.0.1:4400`. `/health` is liveness; `/health/ready` requires PostgreSQL and the installed vector extension. Neither route establishes a product capability. Browser requests use `/api/ui/v1` through a same-origin proxy, with the exact origins configured in `ASI_ALLOWED_ORIGINS`. Session assertions require an injected authentication owner; there is no default login identity or user RBAC.

The default server intentionally has no synthetic product ports. Missing authentication, models, conversations and other owners remain unavailable. The existing OpenClaw typed adapter keeps its relative paths and capability filtering. Production session/authentication and durable UI owners must be composed before a genuine chat workflow can be enabled. Existing domain memory Role/Private visibility rules remain intact; they are not a newly added user RBAC system.

Migration planning remains explicit:

```powershell
node backend/database/migrate.js --target M04
# Compatibility command, same runner:
node scripts/apply-migrations.mjs --target M04
```

Without execution options these commands print a migration plan. Inspect the runner's documented options and owner configuration before applying migrations. SQL migration bytes are preserved; this change does not convert populated stores. SQLite episode storage retains its existing owner.

Install the PostgreSQL `vector` extension for your PostgreSQL server version and provision it through the explicit migration owner. The application runtime never runs `CREATE EXTENSION`. The development machine used for this migration has PostgreSQL 17 but no installed vector extension, so real nearest-neighbor qualification remains pending. The repository helper validates 1536 finite dimensions and binds tenant, model, requested scopes, allowed memory roles and private agent identity.

`pnpm dev` continues to launch the explicitly synthetic Next.js demo. It does not launch the production Express composition. See `RELOCATION.json` for original and current package locations.
