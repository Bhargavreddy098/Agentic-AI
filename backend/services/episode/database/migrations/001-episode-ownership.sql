-- Owner-local SQLite migration manifest for @asi/service-episode
CREATE TABLE IF NOT EXISTS episode_owner_lock (
    owner_id TEXT PRIMARY KEY,
    acquired_at TEXT NOT NULL
);
