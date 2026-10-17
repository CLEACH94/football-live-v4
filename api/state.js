const db=require('./_db');
function dateOnly(v,fallback){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):fallback}
function today(offset=0){const d=new Date(Date.now()+offset*86400000),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`}
module.exports=async function handler(req,res){
 try{
  if(!db.configured())return res.status(200).json({configured:false,version:'v16.3-team-first',fixtures:[],predictions:[],predictionStages:[],lineups:[],live:[],priorityTeams:[],workerState:null,budget:null,audit:[]});
  const from=dateOnly(req.query?.from,today(-30)),to=dateOnly(req.query?.to,today(7));
  const fq=`kickoff=gte.${encodeURIComponent(from+'T00:00:00Z')}&kickoff=lt.${encodeURIComponent(to+'T23:59:59Z')}&select=*&order=kickoff.asc`;
  const fixtures=await db.select('mi_fixtures',fq),ids=(fixtures||[]).map(x=>x.fixture_id),inq=ids.length?`(${ids.join(',')})`:null;
  const common=[
    inq?db.select('mi_predictions',`fixture_id=in.${inq}&select=*`):Promise.resolve([]),
    inq?db.select('mi_prediction_stages',`fixture_id=in.${inq}&select=*`):Promise.resolve([]),
    inq?db.select('mi_lineups',`fixture_id=in.${inq}&select=*`):Promise.resolve([]),
    inq?db.select('mi_live',`fixture_id=in.${inq}&select=*`):Promise.resolve([]),
    db.select('mi_priority_teams','active=eq.true&select=*&order=priority.asc').catch(()=>[]),
    db.select('mi_worker_state','state_key=eq.main&select=payload,updated_at&limit=1').catch(()=>[]),
    db.select('mi_api_usage',`usage_date=eq.${today()}&select=calls,updated_at,last_reason&limit=1`).catch(()=>[]),
    db.select('mi_model_audit','select=payload,updated_at&order=updated_at.asc&limit=20000').catch(()=>[])
  ];
  const [predictions,predictionStages,lineups,live,priorityTeams,worker,budget,audit]=await Promise.all(common);
  res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=60');return res.status(200).json({configured:true,version:'v16.3-team-first',fixtures:fixtures||[],predictions:predictions||[],predictionStages:predictionStages||[],lineups:lineups||[],live:live||[],priorityTeams:priorityTeams||[],workerState:worker?.[0]||null,budget:budget?.[0]||{calls:0},audit:(audit||[]).map(x=>x.payload).filter(Boolean)});
 }catch(e){return res.status(502).json({error:'Live state unavailable',detail:e.message||String(e)})}
}
