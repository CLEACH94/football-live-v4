const db=require('./_db');
module.exports=async function handler(req,res){
 const out={ok:true,version:'v15.4-live-server',apiFootball:!!process.env.API_FOOTBALL_KEY,supabase:db.configured(),cronSecret:!!process.env.CRON_SECRET,softCap:Number(process.env.API_DAILY_SOFT_CAP||6500),hardCap:Number(process.env.API_DAILY_HARD_CAP||7400)};
 if(db.configured()){try{const b=await db.select('mi_api_usage','select=usage_date,calls,updated_at&order=usage_date.desc&limit=1');out.database=true;out.budget=b?.[0]||null}catch(e){out.database=false;out.ok=false;out.databaseError=e.message}}
 return res.status(out.ok?200:503).json(out)
}
