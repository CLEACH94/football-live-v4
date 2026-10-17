const db=require('./_db');
function dateOnly(v,fallback){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):fallback}
function londonDate(offset=0){const d=new Date(Date.now()+offset*86400000),p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function ts(v){const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0}
module.exports=async function handler(req,res){
  try{
    if(!db.configured())return res.status(200).json({configured:false,version:'v16.4.1-state-fix',fixtures:[],predictions:[],predictionStages:[],lineups:[],live:[],priorityTeams:[],workerState:null,budget:null,audit:[],warnings:['Turso not configured']});
    const from=dateOnly(req.query?.from,londonDate(-30)),to=dateOnly(req.query?.to,londonDate(7));
    const lo=ts(from+'T00:00:00Z'),hi=ts(to+'T23:59:59Z');

    // Read a bounded recent fixture set first, then date-filter in JS. This avoids a
    // single SQL/date-format mismatch making the entire app look offline.
    let allFixtures=[],warnings=[];
    try{allFixtures=await db.select('mi_fixtures','select=*&order=kickoff.asc&limit=2000')}catch(e){warnings.push('fixtures: '+(e.message||String(e)))}
    const fixtures=(allFixtures||[]).filter(f=>{const t=ts(f.kickoff);return t>=lo&&t<=hi});
    const ids=fixtures.map(x=>Number(x.fixture_id)).filter(Number.isFinite);
    const inq=ids.length?`(${ids.join(',')})`:null;

    const safe=async(label,p)=>{try{return await p}catch(e){warnings.push(label+': '+(e.message||String(e)));return[]}};
    const [predictions,predictionStages,lineups,live,priorityTeams,worker,budget,audit]=await Promise.all([
      inq?safe('predictions',db.select('mi_predictions',`fixture_id=in.${inq}&select=*`)):[],
      inq?safe('predictionStages',db.select('mi_prediction_stages',`fixture_id=in.${inq}&select=*`)):[],
      inq?safe('lineups',db.select('mi_lineups',`fixture_id=in.${inq}&select=*`)):[],
      inq?safe('live',db.select('mi_live',`fixture_id=in.${inq}&select=*`)):[],
      safe('priorityTeams',db.select('mi_priority_teams','active=eq.true&select=*&order=priority.asc')),
      safe('worker',db.select('mi_worker_state','state_key=eq.main&select=payload,updated_at&limit=1')),
      safe('budget',db.select('mi_api_usage',`usage_date=eq.${londonDate()}&select=calls,updated_at,last_reason&limit=1`)),
      safe('audit',db.select('mi_model_audit','select=payload,updated_at&order=updated_at.desc&limit=2000'))
    ]);

    res.setHeader('Cache-Control','no-store, max-age=0');
    return res.status(200).json({
      configured:true,version:'v16.4.1-state-fix',fixtures,
      predictions:predictions||[],predictionStages:predictionStages||[],lineups:lineups||[],live:live||[],
      priorityTeams:priorityTeams||[],workerState:worker?.[0]||null,budget:budget?.[0]||{calls:0},
      audit:(audit||[]).map(x=>x.payload).filter(Boolean),warnings,
      counts:{stored:(allFixtures||[]).length,window:fixtures.length,predictions:(predictions||[]).length,stages:(predictionStages||[]).length}
    });
  }catch(e){
    // Do not make the whole UI "OFFLINE" because one optional state query failed.
    return res.status(200).json({configured:true,version:'v16.4.1-state-fix',fixtures:[],predictions:[],predictionStages:[],lineups:[],live:[],priorityTeams:[],workerState:null,budget:null,audit:[],warnings:['state fallback: '+(e.message||String(e))],counts:{stored:0,window:0,predictions:0,stages:0}})
  }
}
