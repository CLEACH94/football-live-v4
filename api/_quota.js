const db=require('./_db');
const SOFT=Number(process.env.API_DAILY_SOFT_CAP||6500);
const HARD=Number(process.env.API_DAILY_HARD_CAP||7400);
async function consume(reason='api',critical=false,count=1){
  if(!db.configured()) return {allowed:true,calls:null,soft:SOFT,hard:HARD,untracked:true};
  const d=await db.rpc('mi_consume_api_call',{p_count:count,p_reason:String(reason).slice(0,120),p_soft_cap:SOFT,p_hard_cap:HARD,p_critical:!!critical});
  const out=Array.isArray(d)?d[0]:d;
  if(out&&out.allowed===false){const e=new Error(out.reason||'Daily API budget protected');e.code='API_BUDGET';e.budget=out;throw e}
  return out||{allowed:true};
}
async function apiFootball(path,key,{reason='api',critical=false}={}){
  await consume(reason,critical,1);
  const r=await fetch('https://v3.football.api-sports.io'+path,{headers:{'x-apisports-key':key}});
  const text=await r.text();
  let d;try{d=JSON.parse(text)}catch{d={}}
  if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);
  if(d?.errors&&(Array.isArray(d.errors)?d.errors.length:Object.keys(d.errors||{}).length))throw new Error(Array.isArray(d.errors)?d.errors.join(', '):JSON.stringify(d.errors));
  return d;
}
module.exports={consume,apiFootball,SOFT,HARD};
