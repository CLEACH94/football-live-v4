const db=require('./_db');
const {londonDate}=require('./_v17');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{const turso=db.configured();let counts={fixtures:0,predictions:0},budget={calls:0};if(turso){const day=londonDate();const [fx,pr,b]=await Promise.all([db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(day+'T00:00:00Z')}&select=fixture_id&limit=500`).catch(()=>[]),db.select('mi_predictions','select=fixture_id,stage&limit=5000').catch(()=>[]),db.select('mi_api_usage',`usage_date=eq.${day}&select=calls,last_reason,updated_at&limit=1`).catch(()=>[])]);counts={fixtures:fx.length,predictions:pr.length};budget=b?.[0]||budget}return res.status(200).json({ok:true,version:'v17-beam-me-up',apiFootball:!!process.env.API_FOOTBALL_KEY,turso,database:turso,counts,budget})}catch(e){return res.status(200).json({ok:false,version:'v17-beam-me-up',error:e.message||String(e)})}
}
