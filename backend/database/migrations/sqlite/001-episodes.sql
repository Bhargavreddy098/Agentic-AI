-- ASI Agent System - Episodic Store Schema
-- Migration 001: Episodes, FTS, and compression lineage
-- SQLite 3.45+ compatible (WAL, FTS5)

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;

-- Tenants table (referenced by all tenant-qualified tables)
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Sessions: conversation containers
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    principal_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('observe', 'assist', 'execute')) DEFAULT 'observe',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'completed', 'failed')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    completed_at INTEGER
);

CREATE INDEX idx_sessions_tenant ON sessions (tenant_id);

-- Episodes: immutable event log with FTS5
CREATE TABLE IF NOT EXISTS episodes (
    episode_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('user_message', 'assistant_message', 'tool_call', 'tool_result', 'model_result', 'compression', 'system')),
    content TEXT NOT NULL,
    source_ids TEXT NOT NULL DEFAULT '[]' COMMENT 'JSON array of source event IDs',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    UNIQUE (tenant_id, session_id, sequence)
);

CREATE INDEX idx_episodes_session_seq ON episodes (tenant_id, session_id, sequence);
CREATE INDEX idx_episodes_kind ON episodes (kind);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
    episode_id UNINDEXED,
    tenant_id UNINDEXED,
    session_id UNINDEXED,
    kind UNINDEXED,
    content,
    source_ids UNINDEXED,
    content='episodes',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, episode_id, tenant_id, session_id, kind, content, source_ids)
    VALUES (new.rowid, new.episode_id, new.tenant_id, new.session_id, new.kind, new.content, new.source_ids);
END;

CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, episode_id, tenant_id, session_id, kind, content, source_ids)
    VALUES ('delete', old.rowid, old.episode_id, old.tenant_id, old.session_id, old.kind, old.content, old.source_ids);
END;

CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, episode_id, tenant_id, session_id, kind, content, source_ids)
    VALUES ('delete', old.rowid, old.episode_id, old.tenant_id, old.session_id, old.kind, old.content, old.source_ids);
    INSERT INTO episodes_fts(rowid, episode_id, tenant_id, session_id, kind, content, source_ids)
    VALUES (new.rowid, new.episode_id, new.tenant_id, new.session_id, new.kind, new.content, new.source_ids);
END;

-- Compression lineage: tracks episode compression generations
CREATE TABLE IF NOT EXISTS compressions (
    compression_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    parent_generation INTEGER NOT NULL DEFAULT 0,
    source_range_start INTEGER NOT NULL,
    source_range_end INTEGER NOT NULL,
    source_digests TEXT NOT NULL COMMENT 'JSON array of source episode content hashes',
    prefix_hash TEXT NOT NULL,
    summary_hash TEXT NOT NULL,
    model_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'failed')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    committed_at INTEGER
);

CREATE INDEX idx_compressions_session ON compressions (tenant_id, session_id, parent_generation);

-- Writer lease for session-level write fencing
CREATE TABLE IF NOT EXISTS writer_leases (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    run_id TEXT NOT NULL,
    writer_epoch INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    acquired_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    renewed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Idempotency keys for deduplication
CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_idempotency_tenant ON idempotency_keys (tenant_id);