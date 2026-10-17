const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
function configured(){return !!(base()&&key())}
async function request(path,{method='GET',body=null,headers={}}={}){
  if(!configured()) throw new Error('Supabase is not configured');
  const r=await fetch(base()+'/rest/v1/'+path,{method,headers:{apikey:key(),Authorization:`Bearer ${key()}`,'Content-Type':'application/json',...headers},body:body===null?undefined:JSON.stringify(body)});
  const text=await r.text();
  if(!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0,300)}`);
  if(!text) return null;
  try{return JSON.parse(text)}catch{return text}
}
async function select(table,query=''){return request(`${table}${query?'?'+query:''}`)}
async function upsert(table,rows,onConflict){return request(`${table}${onConflict?`?on_conflict=${encodeURIComponent(onConflict)}`:''}`,{method:'POST',body:Array.isArray(rows)?rows:[rows],headers:{Prefer:'resolution=merge-duplicates,return=representation'}})}
async function insert(table,rows){return request(table,{method:'POST',body:Array.isArray(rows)?rows:[rows],headers:{Prefer:'return=representation'}})}
async function rpc(name,args={}){return request(`rpc/${name}`,{method:'POST',body:args})}
module.exports={configured,select,upsert,insert,rpc};
