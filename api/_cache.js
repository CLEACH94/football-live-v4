const db=require('./_db');
const {apiFootball}=require('./_quota');

function nowIso(){return new Date().toISOString()}
async function get(cacheKey){
  if(!db.configured())return null;
  const q=`cache_key=eq.${encodeURIComponent(cacheKey)}&select=cache_key,payload,expires_at,updated_at&limit=1`;
  const rows=await db.select('mi_api_cache',q).catch(()=>[]);
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row)return null;
  if(new Date(row.expires_at).getTime()<=Date.now())return null;
  return row.payload;
}
async function put(cacheKey,payload,ttlMs){
  if(!db.configured())return;
  await db.upsert('mi_api_cache',{cache_key:cacheKey,payload,expires_at:new Date(Date.now()+Math.max(1000,ttlMs)).toISOString(),updated_at:nowIso()},'cache_key').catch(()=>{});
}
async function cachedApiFootball(path,key,{ttlMs=0,reason='api',critical=false,force=false}={}){
  const k=`af:${path}`;
  if(!force&&ttlMs>0){const hit=await get(k);if(hit)return hit}
  const d=await apiFootball(path,key,{reason,critical});
  if(ttlMs>0)await put(k,d,ttlMs);
  return d;
}
module.exports={get,put,cachedApiFootball};
