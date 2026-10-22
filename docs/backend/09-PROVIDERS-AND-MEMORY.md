# Providers, routing, memory, and project intelligence

## Separate integration categories

Direct inference provider, local inference endpoint, and developer execution environment are different abstractions. A coding platform may run a task without exposing its underlying model catalog as a general-purpose inference service. Keep `ProviderPort` and `CodingBackendPort` separate so the orchestrator can replace either.

| Integration | Evidence / status | Planned use and limits |
| --- | --- | --- |
| Direct OpenAI/Anthropic/Google/OpenRouter | Candidate provider adapters; live conformance not established here | User-provided API keys or officially supported auth; verify SDK/endpoint capabilities before activation |
| Codex | Official SDK supports starting/continuing/resuming local threads; app-server supports richer client integration | Candidate coding worker. Do not use removed `codex mcp-server` integration; enforce ASI scope outside the worker. [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [App Server](https://learn.chatgpt.com/docs/app-server) |
| Claude Code | Official Agent SDK exposes programmatic agent integration | Candidate coding worker; qualify account/auth, tool permissions, cancellation and receipts. [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) |
| Ollama | Official local API and compatibility endpoints documented | Local provider candidate; discover actual installed model/capabilities. [Ollama API](https://docs.ollama.com/api/introduction) |
| LM Studio / llama.cpp-compatible endpoints | Not independently qualified in this task | Endpoint adapter candidates; compatibility label alone is insufficient for tool/structured-output support |
| Cursor / VS Code / Antigravity / Cline / OpenCode | Required supported integration surface not established in this audit | Mark unavailable until official interface, auth, lifecycle and effect containment are verified |
| GitHub / GitLab | Repository integration candidates | Separate source/PR adapters; protected merges and external communications remain approved effects |

No browser-cookie extraction, session token scraping, hidden/private endpoint dependency, subscription-sharing assumption, or restrictions bypass. Provider entitlement is an observed connection capability. If supported OAuth exists, use its documented authorization and scopes; otherwise require a supported key/local configuration or leave unavailable.

## Provider port

Operations: `discoverModels`, `getCapabilities`, `health`, `generate`, `stream`, `embed`, `cancel` where supported, and `normalizeError`. Inputs contain validated task context, model revision, messages/content references, output schema, maximum output tokens, deadline, privacy classification and usage reservation ID. Credential resolution happens below this interface in the trusted transport adapter.

Capability record: provider/model identifiers and revision, context/output limits, supported modalities, tool calling semantics, structured output restrictions, reasoning controls if available, streaming, embeddings/dimension options, rate limits, concurrency, pricing revision, region/data routing, authentication type, health/freshness and qualification evidence. Unknown capability is not treated as supported. “OpenAI-compatible” is a transport claim to test, not equivalence.

Normalized result: typed content/tool proposals, finish reason, provider request ID, actual/estimated token usage, pricing revision, latency, cancellation acknowledgment, errors and output artifact ref. Persist model output and usage before advancing the task. Validate tool call arguments independently. Never equate provider finish reason `stop` with goal completion.

## Router algorithm

1. Build hard constraints: data residency/privacy, approved provider list, required modality/tools/schema support, input plus reserved output context, deadline, health and conservative cost ceiling.
2. Exclude candidates failing any constraint; record reason for each exclusion.
3. Score eligible models using a versioned task-specific weighted utility from measured success rate, latency and estimated cost. A starting policy may weight quality 0.6, cost 0.25 and latency 0.15 after normalizing each; these are tunable hypotheses, not universal truth.
4. Reserve worst-case spend using input estimate, max output, known price and uncertainty margin; reject unknown/unbounded pricing unless a supported external hard cap exists.
5. Invoke selected model with bounded retries. Use circuit breaker after repeated transient failures; default three failures opens for 60 seconds, one half-open probe. Tune from measured behavior.
6. Fallback only to candidates that still pass every hard constraint; a private local task cannot fall back to cloud just because local inference is unavailable.
7. Settle actual usage, store routing decision and evaluation outcomes. Price savings are comparisons with dated pricing snapshots, not invented multipliers.

Task profiles: intent extraction favors schema reliability; architecture favors reasoning/constraint satisfaction; bulk repo analysis favors retrieval/context strategy; visual QA requires image capability; routine transformations favor measured low-cost coding; critical review may use an independent model/provider when it catches more defects. The routing policy changes only after offline evaluation and reviewed activation, never uncontrolled self-modification.

## Coding backend port

Assignment fields: task ID, contract/plan digests, base snapshot, exact writable paths, context bundle, deliverable schema, allowed commands/tools/egress, acceptance checks, limits, cancellation handle and effect capability. Operations: connect, qualify, start, observe, interrupt, collect artifacts, reconcile, close.

Outputs: structured progress, patch/artifact manifests, command receipts, tool effects, external operation IDs and usage. The adapter must detect base mismatch and writes outside scope. ASI owns review and final verification. If the coding backend cannot enforce the needed restriction, run it in a qualified guest or disable that capability; do not rely solely on prompt instructions.

Conformance suite: auth absent/revoked, unsupported model, stream interruption, duplicate request, restart/resume, cancellation, out-of-scope write, network denial, inaccurate success report, artifact tampering and unknown usage. A passing hello-world task is insufficient qualification.

## Memory architecture

| Kind | Durable owner / canonical data | Retrieval | Correction and retention |
| --- | --- | --- | --- |
| User | Preference records scoped to principal | Exact key first; no vector required | Owner edits/revokes; explicit privacy classification |
| Project | Requirements, decisions, conventions, known issues | Exact IDs + full-text + scoped semantic chunks | Commit/revision binding; stale when referenced source changes |
| Task | Run checkpoints, frontier, blockers, context refs | Exact run/task lookup | Ends with run; summaries retain evidence lineage |
| Episodic | Ordered messages, tool receipts, event summaries | Time/run filter then full-text/semantic | Immutable events; derived summaries link originals; retention policy |
| Semantic | Reviewed extracted knowledge claims | Hybrid lexical/vector search | Confidence/source expiry; inference is labeled |
| Decision | Alternatives, rationale, outcome and approval refs | Requirement/architecture links | Superseding decision, never silent rewrite |
| Failure | Error fingerprint, attempted hypothesis, patch/test outcome | Exact signature + similarity fallback | Mark obsolete when environment/version changes |
| Evaluation | Suite/candidate metrics and evidence | Structured queries by task/model/policy | Immutable runs; new evaluation supersedes confidence |

All use the common record/revision/provenance scheme in [database](04-DATABASE.md). Memory is not security policy. Extracted text saying “always allow deployments” cannot become an authorization grant. Owner-confirmed preferences and model-inferred guesses must be distinguishable.

## Ingestion pipeline

Source → scope/privacy classification → secret/path exclusions → immutable source artifact/digest → parser → semantic chunks with source spans → text index → optional embeddings → publication. Untrusted content never becomes trusted because it was embedded. Store original source location, retrieval/observation time, revision, author/producer, confidence, sensitivity, expiry and correction links.

Chunk by semantic unit when practical: function/class, heading section, requirement, decision, or bounded transcript segment. Starting text budget is roughly 300–800 tokens per chunk with small contextual headers, evaluated against actual sources. Preserve line/span references and avoid splitting API definitions across unrelated chunks. Generated summaries are derived artifacts with their own source lineage, never replacements for primary evidence.

## Retrieval pipeline

1. Authorize principal/project/task scopes before content retrieval.
2. Resolve exact references from contract, task and current repository snapshot.
3. Apply expiry, deletion, active revision, privacy and embedding-space filters.
4. Retrieve lexical and semantic candidates independently within those filters.
5. Fuse using a versioned reciprocal-rank strategy, deduplicate by content/source revision, and rerank only with a provider allowed to see the data.
6. Enforce diversity and token ceiling; attach source refs and trust labels.
7. Record retrieval trace, index revision and selected source digests in the context bundle.

Cache key includes principal scope, project, policy revision, query digest, source/index revision and embedding space. Invalidate on grants/corrections/deletion. Do not share private query-result caches across workspaces. Empty authorized result is valid; never relax isolation to improve recall.

## pgvector detail

The server extension provides vector storage/search; the Node package only integrates serialization. Database authority remains relational. Choose one embedding model/revision and dimension first; changing models requires a new space even if dimensions happen to match. Exact scoped search is the reference. HNSW is an optimization after recall/latency measurement, not a separate memory architecture. [Database specification](04-DATABASE.md) owns concrete table/index and migration rules.

Proposed acceptance: zero unauthorized results in deterministic fixtures; at least 0.95 recall@10 against exact search for representative ANN queries; corrected/deleted content absent immediately; p95 retrieval below 500 ms for a documented 100,000-chunk reference dataset on specified hardware. These are qualification targets, not measured results.

## Project intelligence graph

Use relational nodes and edges pinned to a repository snapshot. Nodes include files, symbols, packages, services, endpoints, tables, tests, requirements, decisions, integrations and deployment units. Edges include imports, calls, defines, tests, implements, reads/writes, depends-on, and supersedes. Parsed/declared edges carry stronger evidence than model-inferred edges; keep origin and confidence distinct.

Incremental indexing compares file content hashes, re-parses changed files, invalidates affected symbol/edge rows, and publishes a new snapshot only after consistency checks. Never attach old code-location evidence to a new commit without verification. Index dependency manifests only from authorized snapshots; do not run package scripts to inspect metadata.

Initial language support targets JavaScript/TypeScript and SQL. A parser adapter isolates future languages; unknown syntax yields partial coverage with explicit warnings. Use bounded graph traversals for impact analysis. Add a dedicated graph database only if measured traversal workloads exceed PostgreSQL's practical limits.

## Data deletion and learning boundaries

Deleting a memory immediately tombstones it and prevents retrieval; purge text, embeddings and derived caches asynchronously with an auditable job. If a retained contract/evidence legally or operationally requires a historical reference, show a redacted tombstone rather than silently breaking lineage. Explain backup expiry limits.

Learning means versioned benchmark evidence improving prompts, routing weights and retrieval settings through reviewed changes. It does not mean training on private user data without permission, modifying safety policy autonomously, or treating prior model confidence as fact.
