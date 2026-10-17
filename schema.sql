-- Match Index V16.3.1 — Turso / libSQL schema
-- Normally you do NOT need to run this manually: api/_db.js creates these tables automatically.
CREATE TABLE IF NOT EXISTS mi_api_usage (usage_date TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,last_reason TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_fixtures (fixture_id INTEGER PRIMARY KEY,league_id INTEGER,competition TEXT,kickoff TEXT,status TEXT,minute INTEGER,home_team_id INTEGER,home_team TEXT,away_team_id INTEGER,away_team TEXT,home_score INTEGER,away_score INTEGER,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS mi_fixtures_kickoff_idx ON mi_fixtures(kickoff);
CREATE TABLE IF NOT EXISTS mi_predictions (fixture_id INTEGER PRIMARY KEY,model_version TEXT,stage TEXT,lineup_confirmed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',generated_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_lineups (fixture_id INTEGER PRIMARY KEY,confirmed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_live (fixture_id INTEGER PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL DEFAULT 'running',fixtures_seen INTEGER NOT NULL DEFAULT 0,lineups_checked INTEGER NOT NULL DEFAULT 0,live_checked INTEGER NOT NULL DEFAULT 0,predictions_run INTEGER NOT NULL DEFAULT 0,note TEXT);
CREATE TABLE IF NOT EXISTS mi_engine_lock (lock_name TEXT PRIMARY KEY,locked_until TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',expires_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_model_audit (audit_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_priority_teams (team_id INTEGER PRIMARY KEY,name TEXT NOT NULL,logo TEXT,kind TEXT NOT NULL,source TEXT,tier INTEGER,priority INTEGER NOT NULL DEFAULT 9999,fifa_rank INTEGER,active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_worker_state (state_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mi_prediction_stages (fixture_id INTEGER NOT NULL,stage TEXT NOT NULL,model_version TEXT,lineup_confirmed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',generated_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(fixture_id,stage));
