const db=require('./_db');
function dateOnly(v,fallback){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):fallback}
function today(offset=0){const d=new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
module.exports=async function handler(req,res){
 try{
  if(!db.configured())return res.status(200).json({configured:false,fixtures:[],predictions:[],lineups:[],live:[],budget:null});
  const from=dateOnly(req.query?.from,today()),to=dateOnly(req.query?.to,today(7));
  const fq=`kickoff=gte.${encodeURIComponent(from+'T00:00:00Z')}&kickoff=lt.${encodeURIComponent(to+'T23:59:59Z')}&select=*&order=kickoff.asc`;
  const fixtures=await db.select('mi_fixtures',fq);const ids=(fixtures||[]).map(x=>x.fixture_id);
  if(!ids.length)return res.status(200).json({configured:true,fixtures:[],predictions:[],lineups:[],live:[],budget:null});
  const inq=`(${ids.join(',')})`;
  const [predictions,lineups,live,budget]=await Promise.all([db.select('mi_predictions',`fixture_id=in.${inq}&select=*`),db.select('mi_lineups',`fixture_id=in.${inq}&select=*`),db.select('mi_live',`fixture_id=in.${inq}&select=*`),db.select('mi_api_usage',`usage_date=eq.${today()}&select=calls,updated_at&limit=1`)]);
  res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=60');return res.status(200).json({configured:true,fixtures,predictions,lineups,live,budget:budget?.[0]||{calls:0}});
 }catch(e){return res.status(502).json({error:'Live state unavailable',detail:e.message||String(e)})}
}
