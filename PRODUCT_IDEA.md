# ROLE

Act as a **Principal AI Systems Architect, Staff Software Engineer, Product Architect, Distributed Systems Engineer, Agentic-AI Researcher, Security Architect, Developer-Tools Architect, and Technical Product Strategist**.

You are designing the long-term architecture for an **ASI-inspired autonomous creation platform**.

Do **not** treat this as another chatbot, coding assistant, wrapper around an LLM, multi-agent demo, or simple autonomous coding agent.

The product should eventually allow a person to describe almost any digital outcome they want, including:

- SaaS products
- websites
- e-commerce platforms
- mobile applications
- APIs
- backend systems
- AI applications
- AI agents
- data pipelines
- automations
- scheduled workflows
- research tasks
- browser workflows
- developer tools
- infrastructure
- integrations
- internal business tools
- existing-repository modifications
- greenfield applications
- recurring autonomous operations

The system must reason about the user's actual goal, turn vague intent into a rigorous specification, challenge weak decisions, research unknowns, design the system, obtain approval, execute the work through controlled tools/agents, test it, verify it with evidence, and maintain enough state to continue intelligently over long periods.

The project may call this vision “ASI”, but do not make scientifically unsupported claims that the system achieves artificial superintelligence.

Our goal is to engineer the strongest realistically buildable approximation using current and emerging AI systems.

---

# IMPORTANT: DO NOT START CODING

This task is **research, architecture, decomposition, specification, and implementation planning only**.

Do not implement features yet.

Do not generate placeholder code.

First understand the repository thoroughly and then produce a build-ready architecture and execution plan.

Every major recommendation must explain:

1. why it exists,
2. what problem it solves,
3. alternatives considered,
4. why the selected solution is preferable,
5. dependencies,
6. risks,
7. implementation order,
8. acceptance criteria.

Do not silently invent repository capabilities.

Clearly distinguish:

- already implemented,
- partially implemented,
- mocked,
- planned,
- missing,
- technically uncertain,
- dependent on external-provider capabilities.

Cite repository file paths for repository-derived claims.

---

# PRODUCT VISION

The desired long-term interaction is:

User Intent
↓
Intent Understanding
↓
Business/Product Goal Discovery
↓
Clarification of Material Unknowns
↓
Research
↓
Requirements Engineering
↓
Multiple Planning Layers
↓
Architecture Design
↓
Risk / Cost / Security Analysis
↓
Specialist Review & Debate
↓
Build Contract
↓
User Approval
↓
Autonomous Execution
↓
Continuous Testing
↓
Failure Analysis / Self-Repair
↓
Verification
↓
Product / UX Review
↓
Deployment Approval
↓
Deployment
↓
Evidence-Backed Completion
↓
Persistent Project Intelligence
↓
Scheduled / Event-Driven Ongoing Work

The product must not immediately translate a prompt into code.

Its primary job is to determine:

> “What does this person actually need, what is the strongest practical solution, and how can we prove that we built it correctly?”

---

# CORE PRINCIPLE: THE ORCHESTRATOR IS THE INTELLIGENCE

External coding systems must NOT become the architectural authority.

Examples include:

- Codex
- Claude Code
- Cursor
- VS Code agents/extensions
- Antigravity
- OpenCode
- Cline
- terminal-based coding agents
- future IDE agents

These should be usable as **execution backends / workers**.

The ASI Intelligence Orchestrator remains responsible for:

- goals,
- specifications,
- plans,
- architectural decisions,
- task decomposition,
- model routing,
- agent creation,
- permissions,
- approvals,
- context,
- memory,
- validation,
- verification,
- recovery,
- cost controls,
- completion decisions.

Design the system so execution backends can be replaced without rewriting the intelligence layer.

---

# FIRST KILLER WORKFLOW

The first flagship workflow should be:

## “Idea → Approved Plan → Production-Ready Application”

Example user request:

> “Build me an e-commerce platform for independent fashion brands.”

The system should determine that the user may need things they never explicitly mentioned, such as:

- business requirements,
- user personas,
- buyer flows,
- seller/admin flows,
- catalog,
- inventory,
- pricing,
- authentication,
- authorization where actually required,
- search,
- cart,
- checkout,
- payments,
- orders,
- refunds,
- notifications,
- analytics,
- SEO,
- accessibility,
- observability,
- database design,
- API design,
- security,
- testing,
- infrastructure,
- deployment,
- backups,
- failure handling.

It should NOT blindly add every enterprise feature.

It must decide what is actually justified.

The same system should eventually support modifying existing repositories.

---

# INTELLIGENCE BEHAVIOR

The intelligence layer must:

### Understand intent

Separate:

- what the user literally requested,
- what the user is ultimately trying to accomplish,
- constraints,
- assumptions,
- preferences,
- unknowns,
- acceptance criteria.

### Ask only valuable questions

Do not interrogate unnecessarily.

Ask questions only when the answer materially changes:

- product scope,
- architecture,
- security,
- cost,
- compliance,
- irreversible actions,
- user experience,
- implementation strategy.

Infer low-risk details where reasonable and expose those assumptions.

### Challenge bad decisions

The system must not behave as a passive order taker.

Example:

If a user says:

> “Use 20 microservices, Kafka, Kubernetes and five databases for my MVP.”

ASI should be willing to explain that this is probably unnecessary and propose something simpler.

Categorize decisions as:

- accepted,
- challenged,
- rejected for safety/security,
- alternative proposed,
- requires user decision.

### Research automatically

When needed, research:

- current frameworks,
- APIs,
- official documentation,
- pricing,
- compatibility,
- cloud capabilities,
- libraries,
- security practices,
- competitors,
- architecture approaches,
- relevant standards,
- deployment choices,
- licensing.

Fresh facts must be verified rather than assumed from model memory.

Maintain provenance for important research conclusions.

---

# MULTI-LAYER PLANNING SYSTEM

Design separate but connected planning layers.

At minimum:

1. Intent Plan
2. Product Strategy
3. Requirements Specification
4. User Experience Plan
5. Functional Architecture
6. Technical Architecture
7. Data Architecture
8. API Architecture
9. AI Architecture
10. Integration Architecture
11. Security Architecture
12. Infrastructure Architecture
13. Implementation Plan
14. Testing Strategy
15. Verification Strategy
16. Deployment Plan
17. Operations Plan
18. Cost Plan
19. Risk Plan
20. Maintenance / Evolution Plan

The user should not necessarily see all internal details by default.

Design progressive disclosure:

Executive Plan
→ Detailed Plan
→ Architectural Decisions
→ Individual tasks/evidence.

---

# BUILD CONTRACT

Before execution, produce an immutable/versioned **Build Contract**.

Design its schema.

It should include at minimum:

- goal,
- problem definition,
- expected outcome,
- assumptions,
- unresolved questions,
- user personas,
- functional requirements,
- non-functional requirements,
- exclusions,
- technology stack,
- architecture,
- database,
- APIs,
- integrations,
- model strategy,
- tools required,
- permissions required,
- estimated infrastructure cost,
- estimated model/API cost,
- risks,
- security boundaries,
- implementation phases,
- acceptance criteria,
- verification criteria,
- deployment target,
- autonomy mode.

The user approves a specific revision.

If a significant architectural assumption changes later, the agent must create a proposal/diff and obtain approval before continuing.

Never reinterpret an old approval to authorize materially changed work.

---

# AUTONOMY MODES

Design these four modes as first-class policy states:

### 1. Plan Only

Research and plan.

No repository mutation.

### 2. Ask Before Every Change

Any material mutation requires approval.

### 3. Autonomous Coding

The system may autonomously perform approved development work inside the workspace but cannot perform sensitive external actions.

### 4. Full Autonomous Build

The system can autonomously execute the approved build contract inside explicitly granted boundaries.

Even Full Autonomous Build must require explicit approval for high-impact external actions such as:

- production deployment,
- purchasing infrastructure,
- financial transactions,
- sending external communications,
- publishing publicly,
- merging into protected branches,
- deleting important resources,
- modifying production data,
- creating paid services,
- changing DNS,
- rotating critical credentials.

Design a policy engine rather than hardcoding these rules across services.

---

# DYNAMIC AGENT ARCHITECTURE

Use one main intelligence/orchestration layer capable of dynamically creating specialist roles.

Do not permanently run dozens of agents.

Potential specialists:

- Product Strategist
- Requirements Engineer
- System Architect
- Backend Architect
- Frontend Architect
- UX/Product Designer
- Database Architect
- AI Engineer
- Security Engineer
- DevOps/SRE Engineer
- QA Engineer
- Research Agent
- Code Reviewer
- Performance Engineer
- Accessibility Reviewer
- Cost Analyst
- Documentation Agent

The orchestrator determines when specialists are useful.

Research whether these should be implemented as:

- prompt roles,
- isolated agents,
- processes,
- workflows,
- graph nodes,
- temporary agent sessions,
- or combinations thereof.

Do not use “multi-agent” merely because it sounds sophisticated.

Explain when multiple agents provide measurable benefits.

---

# DEBATE / REVIEW SYSTEM

Specialists may challenge each other.

Example:

System Architect proposes microservices.

Cost Analyst says unnecessary.

Security Architect identifies additional attack surface.

Backend Architect proposes modular monolith.

Orchestrator evaluates evidence and makes a recommendation.

Design structured debate, not uncontrolled agent conversation.

Consider something similar to:

Proposal
→ Critique
→ Counterproposal
→ Evidence
→ Risk analysis
→ Decision.

Avoid infinite debate.

Define:

- debate limits,
- confidence handling,
- tie breaking,
- escalation to user,
- provenance,
- decision records.

---

# MODEL PROVIDER ARCHITECTURE

Users must be able to configure many model sources.

Potential categories:

### Direct providers

- OpenAI
- Anthropic
- Google
- OpenRouter
- other future providers

### Local providers

- Ollama
- LM Studio
- llama.cpp-compatible servers
- OpenAI-compatible local endpoints
- other future local runtimes

### Authenticated developer platforms

Research whether integrations could safely and legitimately use authenticated environments such as:

- Antigravity
- Codex
- Claude Code
- other supported coding environments

If a user logs into an external platform, investigate whether that platform exposes a supported API/SDK/authentication mechanism that allows ASI to discover legitimately available models.

DO NOT assume browser/session credential extraction is acceptable.

DO NOT bypass provider restrictions.

DO NOT scrape tokens or steal authentication credentials.

Separate:

- officially supported OAuth/API authentication,
- user-provided API keys,
- local endpoint configuration,
- IDE/plugin execution connections,
- unsupported/private authentication mechanisms.

Create a provider capability abstraction.

A provider should expose metadata such as:

- models,
- capabilities,
- context window,
- reasoning support,
- tool support,
- vision,
- structured outputs,
- streaming,
- cost,
- rate limits,
- latency,
- privacy/data routing,
- authentication method,
- availability,
- health.

---

# INTELLIGENT MODEL ROUTER

The system should automatically choose models.

Do not simply select “the smartest model.”

Routing should consider:

- task type,
- complexity,
- reasoning requirements,
- context size,
- coding capability,
- tool capability,
- latency,
- price,
- provider health,
- privacy restrictions,
- user budget,
- historical performance,
- availability.

Examples:

Architecture → high-reasoning model.

Simple classification → cheap model.

Large repository analysis → model with strong context/retrieval strategy.

UI visual reasoning → appropriate multimodal model.

Routine code transformation → cost-efficient coding model.

Critical review → independent model/provider when useful.

Design:

- capability registry,
- model scoring,
- routing policies,
- fallback,
- privacy boundaries,
- budgets,
- retry policy,
- provider failure handling,
- benchmark/evaluation data.

Explain how the router learns which models work best without creating uncontrolled self-modification.

---

# IDE / CODING AGENT CONNECTIONS

Design an extensible Developer Environment Adapter system.

Potential integrations:

- Codex
- Claude Code
- Cursor
- VS Code
- Antigravity
- Cline
- OpenCode
- terminal agents
- GitHub
- GitLab
- local terminals.

ASI must remain authoritative.

Example:

ASI Orchestrator
→ Execution Task
→ Codex Adapter
→ Codex performs coding task
→ artifacts/diff/logs returned
→ ASI independently evaluates result
→ test/verification
→ accept/reject/retry.

Do not trust a worker simply because it reports success.

Determine what can be integrated through supported APIs, CLIs, extensions, protocols, MCP, local processes, or plugin systems.

For anything not currently technically possible, mark it clearly instead of inventing an integration.

---

# TOOL RUNTIME

Design a unified tool system for:

- filesystem,
- repository search,
- file editing,
- terminal,
- Git,
- package managers,
- database operations,
- test runners,
- Docker,
- browsers,
- HTTP APIs,
- cloud services,
- IDE agents,
- code search,
- documentation search,
- artifacts,
- email,
- calendar,
- external integrations.

Each tool needs:

- capability declaration,
- typed input/output,
- permission requirements,
- risk classification,
- timeout,
- idempotency behavior,
- audit information,
- retry semantics,
- cancellation semantics,
- output validation.

---

# SANDBOX / EXECUTION SECURITY

Generated code and commands must not receive unrestricted machine access by default.

Research and design a practical Windows-first sandbox strategy.

Consider:

- Windows Sandbox,
- Hyper-V,
- WSL2,
- Docker,
- job objects,
- filesystem ACLs,
- restricted tokens,
- temporary workspaces,
- virtualized browser environments,
- network restrictions.

Define execution levels such as:

Read-only workspace
→ Workspace write
→ Development shell
→ Isolated container/VM
→ External service access
→ Production access.

Security boundaries must remain enforceable even if the model generates malicious or mistaken commands.

---

# BROWSER / COMPUTER CONTROL

The long-term system needs browser/computer capabilities.

Potential activities:

- research,
- documentation,
- application testing,
- visual QA,
- dashboard configuration,
- SaaS integration configuration,
- cloud-console interaction,
- forms,
- development workflows.

Define:

- browser runtime,
- DOM automation,
- visual computer use,
- credential boundaries,
- session management,
- approval requirements,
- action recording,
- screenshot/evidence storage,
- recovery after interrupted actions.

Treat browser content as untrusted input.

Explicitly design prompt-injection defenses.

---

# MEMORY SYSTEM

Design multiple memory scopes.

At minimum:

### User Memory

Stable user preferences and working style.

### Project Memory

Architecture, requirements, technologies, decisions, conventions, known issues.

### Task Memory

Current objective, plan, progress, blockers.

### Episodic Memory

What happened during previous executions.

### Semantic / Knowledge Memory

Reusable information extracted from work.

### Decision Memory

Why important decisions were made.

### Failure Memory

Past failures and attempted fixes.

### Evaluation Memory

What approaches/models worked or failed.

All memories require:

- provenance,
- scope,
- timestamps,
- revisions,
- confidence,
- deletion,
- correction,
- expiry where appropriate,
- access isolation.

Do not treat a vector database as the entire memory architecture.

Explain storage technology and retrieval strategy for each memory class.

---

# PROJECT INTELLIGENCE

ASI should build a continuously updated internal understanding of each project.

It should understand things such as:

- repository structure,
- system architecture,
- services,
- APIs,
- database schema,
- dependencies,
- coding conventions,
- product requirements,
- architecture decisions,
- integrations,
- test coverage,
- known failures,
- technical debt,
- security boundaries,
- deployment model.

Explain how this “Project Intelligence Graph” or equivalent should work.

Investigate whether the best approach is:

- relational storage,
- graph representation,
- embeddings,
- AST/code indexing,
- dependency graphs,
- knowledge graphs,
- hybrid retrieval.

---

# LONG-RUN EXECUTION

Tasks may last minutes, hours, days, or recurring periods.

Design durable execution.

The system must survive:

- application restart,
- process crash,
- provider outage,
- worker crash,
- temporary internet loss,
- user pause,
- machine restart where supported.

Consider:

- durable workflow engines,
- queues,
- checkpoints,
- event sourcing,
- state machines,
- command/effect logs.

Compare technologies such as:

- Temporal,
- BullMQ,
- custom durable orchestrator,
- workflow DAG systems,

and recommend the correct approach.

Do not choose complexity without justification.

---

# SELF-REPAIR LOOP

Design bounded self-repair:

Build
→ Test
→ Detect Failure
→ Diagnose
→ Generate Hypotheses
→ Choose Fix
→ Apply Fix
→ Retest
→ Verify.

Include protections against:

- endless loops,
- repeating identical fixes,
- escalating costs,
- regressions,
- destroying correct code,
- reward hacking,
- falsely weakening tests.

Set:

- retry budgets,
- token budgets,
- time budgets,
- failure-class policies,
- escalation criteria.

---

# VERIFICATION ENGINE

This is one of the most important subsystems.

ASI cannot declare a task complete merely because:

- an LLM said it is complete,
- an IDE agent said it succeeded,
- files were generated,
- tests were skipped,
- a UI visually appeared.

Build an independent verification layer.

Potential verification evidence:

- unit tests,
- integration tests,
- E2E tests,
- build results,
- type checks,
- linting,
- static analysis,
- schema validation,
- API contract testing,
- security scans,
- accessibility checks,
- performance tests,
- visual tests,
- requirement-level acceptance tests,
- source evidence,
- deployment health checks.

Map:

Requirement
→ Acceptance Criterion
→ Verification Method
→ Evidence
→ Pass / Fail / Unknown.

Explain how verification stays sufficiently independent from implementation agents.

---

# PRODUCT / UX INTELLIGENCE

Do not verify only code.

For user-facing products, review:

- hierarchy,
- usability,
- workflows,
- accessibility,
- responsive behavior,
- empty states,
- loading states,
- error states,
- onboarding,
- consistency,
- interaction quality,
- visual polish,
- user-goal completion.

Define a Product Quality Review stage before completion.

---

# SCHEDULING

Support natural language such as:

> “Every Monday morning review this repository, run tests, check dependencies and create a report.”

Design:

- schedules,
- recurrence,
- timezone,
- retries,
- concurrency,
- missed runs,
- history,
- pause/resume,
- resource limits.

---

# EVENT-DRIVEN AUTOMATION

Eventually support:

- GitHub event,
- PR opened,
- issue created,
- deployment failed,
- webhook received,
- email received,
- file changed,
- monitoring alert,
- scheduled time reached.

Design:

Event
→ Trigger
→ Policy
→ Goal creation
→ Plan
→ Execution
→ Verification
→ Notification/artifact.

---

# DEPLOYMENT

Eventually support deployment to systems such as:

- AWS
- Azure
- GCP
- Vercel
- Cloudflare
- Railway
- Render
- Docker environments
- Kubernetes where justified.

Also potentially manage:

- CI/CD,
- databases,
- migrations,
- environment variables,
- secrets,
- domains,
- DNS,
- monitoring,
- backups.

External high-impact actions require explicit authorization.

Never expose cloud credentials to model prompts.

---

# SECRET MANAGEMENT

Design robust secret architecture.

Credentials must never casually enter:

- LLM context,
- logs,
- memory embeddings,
- artifacts,
- generated code,
- debugging traces.

Research suitable Windows-first secret storage.

Create:

Secret Reference
→ Trusted Runtime Resolution
→ Tool Invocation.

The model sees references/capabilities rather than raw credentials wherever possible.

---

# COST INTELLIGENCE

Track cost across:

- model calls,
- coding backends,
- APIs,
- cloud infrastructure,
- browser services,
- databases,
- storage,
- build infrastructure.

Support:

- per-task budgets,
- per-project budgets,
- warnings,
- hard limits,
- estimated remaining cost,
- model substitution,
- cost/performance decisions.

The system should be able to say:

> “Model A is likely 8× more expensive here without meaningful benefit, so Model B is recommended.”

But critical work may justify higher-cost models.

---

# OBSERVABILITY

Design end-to-end traceability.

We need to answer:

- What was the user's goal?
- Which Build Contract revision was approved?
- Which plan step ran?
- Which model was used?
- Which specialist proposed the action?
- Which worker executed it?
- Which files changed?
- Which commands ran?
- What did they return?
- What cost was incurred?
- What failed?
- Why did the orchestrator retry?
- Which evidence proves completion?

Define trace IDs across:

User
→ Conversation
→ Goal
→ Plan
→ Run
→ Agent
→ Model Call
→ Tool Call
→ Effect
→ Artifact
→ Verification.

---

# DATA MODEL

Design the main database entities.

At minimum investigate entities such as:

- users/local identity
- workspaces
- projects
- conversations
- goals
- requirements
- build contracts
- plans
- plan revisions
- plan steps
- runs
- agents
- agent sessions
- model providers
- models
- provider credentials/references
- developer environment connections
- tools
- permissions
- approvals
- commands
- effects
- tasks
- events
- schedules
- memories
- knowledge nodes
- knowledge edges
- artifacts
- source references
- evaluations
- verification criteria
- verification results
- usage
- cost
- failures
- checkpoints
- deployments
- notifications
- audit events.

Do not blindly create a table for everything.

Determine appropriate ownership and boundaries.

Provide an ERD or Mermaid model.

---

# BACKEND ARCHITECTURE

Evaluate whether this system should initially use:

- modular monolith,
- service-oriented architecture,
- microservices,
- hybrid architecture.

Do not automatically choose microservices because the product is ambitious.

Design clear domain boundaries first.

Potential domains:

- Identity / Session
- Projects
- Conversations
- Goals
- Planning
- Orchestration
- Agents
- Inference
- Provider Registry
- Model Router
- Developer Environments
- Tool Runtime
- Browser Runtime
- Memory
- Project Intelligence
- Approvals
- Policies
- Verification
- Scheduling
- Events
- Artifacts
- Usage / Cost
- Deployment
- Observability.

Recommend how these should evolve over time.

---

# FRONTEND ARCHITECTURE

The product must expose complexity without overwhelming the user.

Design primary UX around:

### Chat / Intent

Describe goals and communicate with ASI.

### Plan

See what ASI proposes.

### Build Contract

Approve scope and architectural decisions.

### Execution

See live progress.

### Approvals

Review high-impact decisions.

### Artifacts

Open generated work.

### Verification

See evidence rather than a vague success badge.

### Models & Providers

Configure AI providers.

### Developer Environments

Connect Codex, Claude Code, Cursor, VS Code, Antigravity, etc.

### Tools & Connections

Manage allowed capabilities.

### Memory / Project Intelligence

Inspect what ASI understands.

### Activity

See executions, failures, costs and history.

### Scheduling / Automations

Manage recurring and triggered work.

### Settings / Security

Manage local runtime, privacy, limits and infrastructure.

Propose screen hierarchy and core UX flows.

---

# API DESIGN

Produce a comprehensive API surface.

At minimum define APIs for:

- projects,
- conversations,
- intent,
- goals,
- requirements,
- plans,
- plan revisions,
- build contracts,
- approvals,
- runs,
- agents,
- providers,
- models,
- model routing,
- IDE connections,
- tools,
- tool permissions,
- memories,
- knowledge,
- artifacts,
- verification,
- usage,
- budgets,
- events,
- schedules,
- deployments,
- activity,
- settings.

For each API include:

- method,
- route,
- purpose,
- request shape,
- response shape,
- authentication expectations,
- important errors,
- idempotency considerations.

Also identify where:

- REST,
- SSE,
- WebSockets,
- internal RPC,
- asynchronous events

are appropriate.

---

# WINDOWS-FIRST, FUTURE-COMPATIBLE

Version 1 remains Windows/local-first.

Do not design it so tightly around Windows that later migration becomes impossible.

Long term it may become:

Desktop Client
+
Local Execution Runtime
+
Optional Cloud Control Plane
+
Optional Remote Workers.

Explain the transition path.

---

# FUTURE SAAS

The current system may be individual/local-first.

Future architecture should permit:

- accounts,
- cloud synchronization,
- organizations,
- remote agents,
- distributed execution,
- collaboration,
- billing,
- shared projects.

Do NOT prematurely implement enterprise multi-tenancy into the first local version.

Identify the seams that prevent an expensive rewrite later.

---

# REQUIRED REPOSITORY ANALYSIS

Before proposing the target architecture:

1. Read the repository README.
2. Read architecture documents.
3. Read product requirements.
4. Read planning documents.
5. Inspect backend structure.
6. Inspect frontend structure.
7. Inspect database models/migrations.
8. Inspect routes/controllers/services.
9. Inspect provider integrations.
10. Inspect agent/orchestrator implementation.
11. Inspect memory code.
12. Inspect tool-runtime code.
13. Inspect security/authentication.
14. Inspect task/workflow systems.
15. Inspect tests.
16. Inspect environment/configuration.
17. Inspect deployment configuration.
18. Inspect existing ASI V1/V2 documents if present.
19. Inspect previous migration/reconciliation documents.
20. Inspect implementation/task ledgers if present.

Create:

Existing
vs
Partial
vs
Mocked
vs
Missing
vs
Should Be Removed.

Cite exact repository paths.

Do not trust planning documents as evidence that functionality exists.

---

# RESEARCH REQUIREMENT

Use current external research where appropriate.

Prioritize:

1. official documentation,
2. official repositories,
3. technical specifications,
4. authoritative engineering material.

Research relevant modern systems and architectures where useful, including categories such as:

- autonomous coding agents,
- durable workflow systems,
- LLM orchestration,
- model gateways,
- IDE integrations,
- sandboxing,
- browser automation,
- agent memory,
- code intelligence,
- verification systems.

You may examine systems such as Codex, Claude Code, Cursor, OpenHands, OpenClaw, Hermes, T3 Code, Temporal and similar projects for architectural lessons.

Do not clone them blindly.

For each useful comparison explain:

- what they do well,
- what is applicable,
- what is not applicable,
- what ASI should do differently.

---

# ANTI-PATTERNS TO AVOID

Explicitly guard against:

### “Vibe-coded” agent architecture

Do not create dozens of loosely defined agents.

### Giant prompt as architecture

Prompts are not durable system state.

### Everything in vector DB

Memory requires structured storage and provenance.

### LLM decides security

Security must be enforced by trusted runtime code.

### LLM says “done”

Verification determines completion.

### Unlimited retries

Every execution requires budgets.

### Autonomous shell access

Use capabilities and sandboxing.

### Microservices everywhere

Choose boundaries based on actual operational need.

### Context dumping

Do not send an entire repository into every model call.

### Provider lock-in

Use adapters/capability interfaces.

### IDE lock-in

Developer environments are interchangeable workers.

### Silent plan mutation

Material changes require reapproval.

### Fake integrations

If an external system lacks a supported integration mechanism, say so.

---

# REQUIRED OUTPUT

Produce one comprehensive **ASI Master Architecture & Build Plan**.

Use the following structure.

## Part 1 — Executive Understanding

Explain what this product actually is.

Explain how it differs from:

- chatbot,
- coding assistant,
- coding agent,
- workflow automation system,
- generic multi-agent framework.

## Part 2 — Current Repository Reality

Show:

Implemented
Partial
Mocked
Missing
Deprecated/Conflicting.

Cite paths.

## Part 3 — Product Principles

Define 10–20 architectural/product principles.

## Part 4 — Killer Workflow

Fully map:

Idea
→ specification
→ plan
→ approval
→ implementation
→ verification
→ deployment.

## Part 5 — Intelligence Architecture

Design:

Intent Engine
Requirements Engine
Research Engine
Planning Engine
Architecture Engine
Decision Engine
Orchestrator
Dynamic Agent Engine
Debate/Critique Engine
Model Router
Context Engine.

## Part 6 — Complete System Architecture

Provide Mermaid diagrams for:

- logical architecture,
- runtime architecture,
- data flow,
- agent execution,
- tool execution,
- approval lifecycle,
- verification,
- recovery.

## Part 7 — Domain Boundaries

Explain modules/services and ownership.

## Part 8 — Provider & Model System

Including direct provider, local model, authentication, capability discovery and routing.

## Part 9 — IDE / Developer Environment System

Design execution adapters.

## Part 10 — Tool & Sandbox Runtime

Detailed runtime and permission architecture.

## Part 11 — Browser / Computer Runtime

Design safely.

## Part 12 — Memory & Project Intelligence

Design all scopes and retrieval.

## Part 13 — Durable Orchestration

Explain task lifecycle and recovery.

## Part 14 — Agent Architecture

Creation, lifecycle, isolation, debate and termination.

## Part 15 — Verification Engine

Requirement-to-evidence architecture.

## Part 16 — Scheduling & Events

Recurring and triggered execution.

## Part 17 — Deployment Architecture

Local first, then cloud.

## Part 18 — Security Architecture

Threat model including:

- prompt injection,
- malicious repository content,
- tool abuse,
- credential theft,
- privilege escalation,
- dependency attacks,
- browser attacks,
- unsafe generated code,
- agent impersonation,
- approval replay,
- data leakage.

## Part 19 — PostgreSQL/Data Architecture

Schemas/entities, relationships and indexes.

Indicate where PostgreSQL, pgvector, graph representation, Redis or other storage is genuinely useful.

## Part 20 — API Architecture

Provide the complete API inventory.

## Part 21 — Frontend Product Architecture

Navigation, pages, important components and flows.

## Part 22 — Observability & Cost System

Tracing, logs, metrics, usage and cost.

## Part 23 — Evaluation Framework

How do we measure whether intelligence is improving?

Define benchmark suites for:

- requirement understanding,
- architecture,
- coding,
- debugging,
- planning,
- tool use,
- cost efficiency,
- verification,
- long-run reliability.

## Part 24 — Failure & Recovery Model

Enumerate failure classes and recovery policies.

## Part 25 — Technology Decisions

Recommend the complete stack.

For every major choice provide alternatives and rationale.

## Part 26 — Repository Target Structure

Give a proposed production-grade monorepo/folder structure.

Explain every major directory.

## Part 27 — Migration Strategy

Map current repository → target architecture.

Do not recommend rewriting working components unnecessarily.

## Part 28 — Exact Implementation Sequence

This is extremely important.

Give a strict dependency-aware build order.

Not vague phases like:

> “Build backend.”

Instead something like:

Foundation
→ identity/session/security
→ database contracts
→ provider abstraction
→ first real provider
→ model registry
→ model router
→ tool contracts
→ sandbox
→ durable workflow engine
→ task model
→ intent engine
→ requirements engine
→ planning engine
→ approval engine
→ Build Contract
→ orchestrator
→ worker adapters
→ verification engine
→ first killer workflow
→ UI integration
→ memory
→ additional providers
→ IDE adapters
→ scheduling
→ browser runtime
→ deployment runtime
→ advanced agents
→ SaaS evolution.

But determine the best actual sequence based on repository evidence.

For EVERY implementation stage specify:

- objective,
- dependencies,
- backend work,
- frontend work,
- database work,
- APIs,
- tests,
- security requirements,
- exit criteria,
- what NOT to build yet.

## Part 29 — MVP vs V1 vs V2 vs Long-Term ASI Vision

Clearly separate:

### MVP

Prove the killer workflow.

### V1

Reliable autonomous development platform.

### V2

Broader tools/models/automations.

### Long-Term

General digital creation and autonomous operation.

Prevent us from trying to build the entire vision simultaneously.

## Part 30 — Top Technical Risks

Rank the 20 most important risks.

For each:

Probability
Impact
Mitigation
Detection.

## Part 31 — Open Questions

Only include questions that genuinely require product-owner decisions.

Do not ask questions whose answers can be derived through engineering research.

## Part 32 — Final Recommended Build Roadmap

End with a concise dependency chain:

STEP 01
↓
STEP 02
↓
STEP 03
...

I should be able to follow these steps one at a time inside Codex without wondering what to build next.

---

# QUALITY BAR

Be extremely critical.

Do not agree with our existing design simply because it exists.

Challenge:

- unnecessary microservices,
- bad database boundaries,
- overengineered agent systems,
- weak security,
- fake autonomy,
- inadequate verification,
- bad provider abstractions,
- unsupported integrations,
- premature SaaS complexity.

When a simpler solution is stronger, say so.

When something cannot currently be implemented reliably, say so.

When a concept needs experimentation before architecture is finalized, identify the experiment.

The final result should be detailed enough that a senior engineering team could start implementation without re-architecting the entire system after the first few phases.

The architecture should optimize for:

**Intelligence + Reliability + Verifiability + Extensibility + User Control + Security + Cost Efficiency**

not merely maximum autonomy.