const { createClient } = require('@libsql/client');
let client=null, ready=false;
function configured(){return !!(process.env.TURSO_DATABASE_URL&&process.env.TURSO_AUTH_TOKEN)}
function db(){
  if(!configured()) return null;
  if(!client) client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  return client;
}
async function ensure(){
  if(ready||!configured()) return configured();
  const c=db();
  const sqls=[
    `CREATE TABLE IF NOT EXISTS current_predictions (fixture_id TEXT PRIMARY KEY, payload TEXT NOT NULL, stage TEXT, model_version TEXT, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS prediction_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, fixture_id TEXT NOT NULL, stage TEXT NOT NULL, model_version TEXT NOT NULL, cycle_id TEXT NOT NULL, payload TEXT NOT NULL, prediction_ts TEXT NOT NULL, data_cutoff_ts TEXT, feature_version TEXT, calibration_version TEXT, is_complete INTEGER NOT NULL DEFAULT 1, UNIQUE(fixture_id,stage,model_version,cycle_id))`,
    `CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, payload TEXT NOT NULL, settled_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS model_audit (audit_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS app_state (state_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, job_type TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER DEFAULT 999, progress REAL DEFAULT 0, cursor TEXT, detail TEXT, next_check_due TEXT, updated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS league_projections (league_id TEXT PRIMARY KEY, payload TEXT NOT NULL, model_version TEXT, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS snapshots (snapshot_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS model_versions (version TEXT PRIMARY KEY, role TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS signal_evidence (signal_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS bookmaker_snapshots (snapshot_key TEXT PRIMARY KEY, fixture_id TEXT NOT NULL, payload TEXT NOT NULL, captured_at TEXT NOT NULL)`
  ];
  for(const sql of sqls) await c.execute(sql);
  ready=true; return true;
}
function j(v){return JSON.stringify(v??null)}
function p(v,f=null){try{return JSON.parse(v)}catch{return f}}
module.exports={db,ensure,configured,j,p};
