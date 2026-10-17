const db=require('./_db');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 const out={ok:true,version:'v16.5-usable-today',apiFootball:!!process.env.API_FOOTBALL_KEY,turso:db.configured(),cronSecret:!!process.env.CRON_SECRET,softCap:Number(process.env.API_DAILY_SOFT_CAP||5500),hardCap:Number(process.env.API_DAILY_HARD_CAP||7400),protectedReserve:2000,vercelPlan:'Hobby-compatible: daily cron + in-app worker'};
 if(db.configured())try{
  const [b,t,w,f,p]=await Promise.all([
   db.select('mi_api_usage','select=usage_date,calls,updated_at,last_reason&order=usage_date.desc&limit=1'),
   db.select('mi_priority_teams','select=team_id'),
   db.select('mi_worker_state','state_key=eq.main&select=payload,updated_at&limit=1').catch(()=>[]),
   db.select('mi_fixtures','select=fixture_id&limit=2000').catch(()=>[]),
   db.select('mi_predictions','select=fixture_id,stage,lineup_confirmed&limit=2000').catch(()=>[])
  ]);
  out.database=true;out.budget=b?.[0]||null;out.priorityTeams=t?.length||0;out.worker=w?.[0]||null;out.counts={fixtures:f?.length||0,predictions:p?.length||0,initial:(p||[]).filter(x=>x.stage==='scout').length,deep:(p||[]).filter(x=>x.stage==='deep').length,final:(p||[]).filter(x=>x.stage==='final'||x.lineup_confirmed).length};
 }catch(e){out.database=false;out.ok=false;out.databaseError=e.message}
 return res.status(out.ok?200:503).json(out)
}
