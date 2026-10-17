const db=require('./_db');
module.exports=async function handler(req,res){
 const out={ok:true,version:'v16.3.3-team-schedule-fix',apiFootball:!!process.env.API_FOOTBALL_KEY,turso:db.configured(),cronSecret:!!process.env.CRON_SECRET,softCap:Number(process.env.API_DAILY_SOFT_CAP||5500),hardCap:Number(process.env.API_DAILY_HARD_CAP||7400),protectedReserve:2000,vercelPlan:'Hobby-compatible: daily cron + in-app worker'};
 if(db.configured()){try{const [b,t,w]=await Promise.all([db.select('mi_api_usage','select=usage_date,calls,updated_at,last_reason&order=usage_date.desc&limit=1'),db.select('mi_priority_teams','select=team_id'),db.select('mi_worker_state','state_key=eq.main&select=payload,updated_at&limit=1').catch(()=>[])]);out.database=true;out.budget=b?.[0]||null;out.priorityTeams=t?.length||0;out.worker=w?.[0]||null}catch(e){out.database=false;out.ok=false;out.databaseError=e.message}}
 return res.status(out.ok?200:503).json(out)
}
