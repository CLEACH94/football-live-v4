const { createClient } = require('@libsql/client');

const url=()=>process.env.TURSO_DATABASE_URL||process.env.LIBSQL_URL||'';
const authToken=()=>process.env.TURSO_AUTH_TOKEN||process.env.LIBSQL_AUTH_TOKEN||'';
function configured(){return !!(url()&&authToken())}

let _client=null,_schemaReady=null;
function client(){
  if(!configured())throw new Error('Turso is not configured');
  if(!_client)_client=createClient({url:url(),authToken:authToken()});
  return _client;
}

const SCHEMA=[
`CREATE TABLE IF NOT EXISTS mi_api_usage (usage_date TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,last_reason TEXT,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS mi_fixtures (fixture_id INTEGER PRIMARY KEY,league_id INTEGER,competition TEXT,kickoff TEXT,status TEXT,minute INTEGER,home_team_id INTEGER,home_team TEXT,away_team_id INTEGER,away_team TEXT,home_score INTEGER,away_score INTEGER,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS mi_fixtures_kickoff_idx ON mi_fixtures(kickoff)`,
`CREATE TABLE IF NOT EXISTS mi_predictions (fixture_id INTEGER PRIMARY KEY,model_version TEXT,stage TEXT,lineup_confirmed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',generated_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS mi_lineups (fixture_id INTEGER PRIMARY KEY,confirmed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',checked_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS mi_live (fixture_id INTEGER PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS mi_engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL DEFAULT 'running',fixtures_seen INTEGER NOT NULL DEFAULT 0,lineups_checked INTEGER NOT NULL DEFAULT 0,live_checked INTEGER NOT NULL DEFAULT 0,predictions_run INTEGER NOT NULL DEFAULT 0,note TEXT)`,
`CREATE TABLE IF NOT EXISTS mi_engine_lock (lock_name TEXT PRIMARY KEY,locked_until TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS mi_api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',expires_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS mi_api_cache_expires_idx ON mi_api_cache(expires_at)`,
`CREATE TABLE IF NOT EXISTS mi_model_audit (audit_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS mi_model_audit_updated_idx ON mi_model_audit(updated_at)`,
`CREATE TABLE IF NOT EXISTS mi_priority_teams (team_id INTEGER PRIMARY KEY,name TEXT NOT NULL,logo TEXT,kind TEXT NOT NULL,source TEXT,tier INTEGER,priority INTEGER NOT NULL DEFAULT 9999,fifa_rank INTEGER,active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS mi_priority_teams_priority_idx ON mi_priority_teams(priority)`,
`CREATE TABLE IF NOT EXISTS mi_worker_state (state_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS mi_prediction_stages (fixture_id INTEGER NOT NULL,stage TEXT NOT NULL,model_version TEXT,lineup_confirmed INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}',generated_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(fixture_id,stage))`,
`CREATE INDEX IF NOT EXISTS mi_prediction_stages_fixture_idx ON mi_prediction_stages(fixture_id)`
];

async function ensureSchema(){
  if(!_schemaReady)_schemaReady=(async()=>{const c=client();await c.batch(SCHEMA.map(sql=>({sql,args:[]})),'write');return true})().catch(e=>{_schemaReady=null;throw e});
  return _schemaReady;
}

const JSON_COLS=new Set(['payload']);
const BOOL_COLS=new Set(['lineup_confirmed','confirmed','active']);
const safeIdent=s=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(s)))throw new Error('Unsafe SQL identifier');return String(s)};
function encodeValue(k,v){if(v===undefined)return null;if(v===null)return null;if(BOOL_COLS.has(k))return v?1:0;if(typeof v==='object')return JSON.stringify(v);return v}
function decodeRow(row){const o={...row};for(const k of Object.keys(o)){if(JSON_COLS.has(k)&&typeof o[k]==='string'){try{o[k]=JSON.parse(o[k])}catch{}}if(BOOL_COLS.has(k)&&o[k]!==null&&o[k]!==undefined)o[k]=!!o[k]}return o}
function rowsOf(result){return (result?.rows||[]).map(r=>decodeRow(r))}

function parseFilter(field,raw,args){
  const f=safeIdent(field),v=String(raw||'');
  if(v.startsWith('eq.')){let x=v.slice(3);if(x==='true')x=1;else if(x==='false')x=0;args.push(x);return `${f} = ?`}
  if(v.startsWith('gte.')){args.push(v.slice(4));return `${f} >= ?`}
  if(v.startsWith('lte.')){args.push(v.slice(4));return `${f} <= ?`}
  if(v.startsWith('gt.')){args.push(v.slice(3));return `${f} > ?`}
  if(v.startsWith('lt.')){args.push(v.slice(3));return `${f} < ?`}
  if(v.startsWith('ilike.')){args.push(v.slice(6).replace(/\*/g,'%'));return `LOWER(${f}) LIKE LOWER(?)`}
  if(v.startsWith('in.(')&&v.endsWith(')')){const vals=v.slice(4,-1).split(',').filter(Boolean);if(!vals.length)return '1=0';args.push(...vals);return `${f} IN (${vals.map(()=>'?').join(',')})`}
  return null;
}
function parseOr(raw,args){
  const s=String(raw||'');if(!s.startsWith('(')||!s.endsWith(')'))return null;
  const inner=s.slice(1,-1),parts=inner.split(',').map(x=>x.trim()).filter(Boolean),bits=[];
  for(const p of parts){const m=p.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|gte|lte|gt|lt)\.(.*)$/);if(!m)continue;const [,field,op,val]=m,argsOp={eq:'=',gte:'>=',lte:'<=',gt:'>',lt:'<'};args.push(val);bits.push(`${safeIdent(field)} ${argsOp[op]} ?`)}
  return bits.length?`(${bits.join(' OR ')})`:null;
}
async function select(table,query=''){
  await ensureSchema();const t=safeIdent(table),sp=new URLSearchParams(query),args=[],where=[];
  for(const [k,v] of sp.entries()){
    if(['select','order','limit'].includes(k))continue;
    if(k==='or'){const bit=parseOr(v,args);if(bit)where.push(bit);continue}
    const bit=parseFilter(k,v,args);if(bit)where.push(bit);
  }
  let fields='*';if(sp.get('select')&&sp.get('select')!=='*')fields=sp.get('select').split(',').map(safeIdent).join(',');
  let sql=`SELECT ${fields} FROM ${t}`;if(where.length)sql+=' WHERE '+where.join(' AND ');
  const order=sp.get('order');if(order){const [f,dir='asc']=order.split('.');sql+=` ORDER BY ${safeIdent(f)} ${String(dir).toLowerCase()==='desc'?'DESC':'ASC'}`}
  const limit=Number(sp.get('limit'));if(Number.isFinite(limit)&&limit>0)sql+=` LIMIT ${Math.floor(limit)}`;
  const r=await client().execute({sql,args});return rowsOf(r)
}

async function upsert(table,rows,onConflict){
  await ensureSchema();const t=safeIdent(table),list=Array.isArray(rows)?rows:[rows];if(!list.length)return[];const out=[];
  for(const row of list){const keys=Object.keys(row).filter(k=>row[k]!==undefined).map(safeIdent),vals=keys.map(k=>encodeValue(k,row[k])),conf=String(onConflict||'').split(',').filter(Boolean).map(safeIdent);let sql=`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`;
    if(conf.length){const updates=keys.filter(k=>!conf.includes(k));sql+=` ON CONFLICT (${conf.join(',')}) DO UPDATE SET ${updates.length?updates.map(k=>`${k}=excluded.${k}`).join(','):' '+conf[0]+'='+conf[0]}`}
    sql+=' RETURNING *';const r=await client().execute({sql,args:vals});out.push(...rowsOf(r))}
  return out
}
async function insert(table,rows){
  await ensureSchema();const t=safeIdent(table),list=Array.isArray(rows)?rows:[rows],out=[];for(const row of list){const keys=Object.keys(row).filter(k=>row[k]!==undefined).map(safeIdent),vals=keys.map(k=>encodeValue(k,row[k]));const sql=`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')}) RETURNING *`;const r=await client().execute({sql,args:vals});out.push(...rowsOf(r))}return out
}
function londonDate(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
async function rpc(name,args={}){
  await ensureSchema();const c=client();
  if(name==='mi_try_engine_lock'){
    const now=new Date(),until=new Date(now.getTime()+Math.max(30,Number(args.p_seconds||105))*1000).toISOString(),n=now.toISOString();
    await c.execute({sql:`INSERT OR IGNORE INTO mi_engine_lock(lock_name,locked_until,updated_at) VALUES ('main','1970-01-01T00:00:00.000Z',?)`,args:[n]});
    const r=await c.execute({sql:`UPDATE mi_engine_lock SET locked_until=?,updated_at=? WHERE lock_name='main' AND locked_until<=?`,args:[until,n,n]});return Number(r.rowsAffected||0)>0
  }
  if(name==='mi_consume_api_call'){
    const date=londonDate(),count=Math.max(1,Number(args.p_count||1)),soft=Number(args.p_soft_cap||5500),hard=Number(args.p_hard_cap||7400),critical=!!args.p_critical,reason=String(args.p_reason||'api').slice(0,120),now=new Date().toISOString();
    await c.execute({sql:`INSERT OR IGNORE INTO mi_api_usage(usage_date,calls,last_reason,updated_at) VALUES (?,0,?,?)`,args:[date,reason,now]});
    const cur=rowsOf(await c.execute({sql:`SELECT calls FROM mi_api_usage WHERE usage_date=? LIMIT 1`,args:[date]}))[0]||{calls:0},calls=Number(cur.calls||0);
    if(calls+count>hard)return{allowed:false,reason:'Hard daily API reserve reached',calls,soft,hard};
    if(!critical&&calls+count>soft)return{allowed:false,reason:'Soft daily API cap reached; preserving live/XI reserve',calls,soft,hard};
    const next=calls+count;await c.execute({sql:`UPDATE mi_api_usage SET calls=?,last_reason=?,updated_at=? WHERE usage_date=?`,args:[next,reason,now,date]});return{allowed:true,calls:next,remaining:hard-next,soft,hard}
  }
  throw new Error(`Unsupported database RPC: ${name}`)
}

module.exports={configured,select,upsert,insert,rpc,ensureSchema};
