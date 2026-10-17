const db=require('./_db');
function dateOnly(v,fallback){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):fallback}
function londonDate(offset=0){const d=new Date(Date.now()+offset*86400000),p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
function ts(v){const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0}
function compactFixture(f){const p=f.payload||{};return{fixture_id:f.fixture_id,league_id:f.league_id,competition:f.competition,kickoff:f.kickoff,status:f.status,minute:f.minute,home_team_id:f.home_team_id,home_team:f.home_team,away_team_id:f.away_team_id,away_team:f.away_team,home_score:f.home_score,away_score:f.away_score,payload:{league:{season:p?.league?.season},teams:{home:{logo:p?.teams?.home?.logo},away:{logo:p?.teams?.away?.logo}}}}}
function compactPrediction(r){const p=r.payload||{};return{fixture_id:r.fixture_id,model_version:r.model_version,stage:r.stage,lineup_confirmed:!!r.lineup_confirmed,generated_at:r.generated_at,updated_at:r.updated_at,payload:{model:p.model,analysisStage:p.analysisStage||r.stage,lineupConfirmed:!!p.lineupConfirmed,dataLayers:p.dataLayers||null,predictions:(p.predictions||[]).map(x=>({id:x.id,rule:x.rule,type:x.type,title:x.title,p:x.p,rawP:x.rawP,reasons:(x.reasons||[]).slice(0,3),watch:(x.watch||[]).slice(0,2),stats:x.stats?{expectedHome:x.stats.expectedHome,expectedAway:x.stats.expectedAway,dataConfidence:x.stats.dataConfidence,last5HitRate:x.stats.last5HitRate,engineAgreement:x.stats.engineAgreement,analysisStage:x.stats.analysisStage,lineupConfirmed:x.stats.lineupConfirmed}:null}))}}}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    if(!db.configured())return res.status(200).json({configured:false,version:'v16.5-state',fixtures:[],predictions:[],predictionStages:[],lineups:[],priorityTeams:[],workerState:null,budget:null,warnings:['Turso not configured'],counts:{stored:0,window:0,predictions:0,stages:0}});
    const summary=String(req.query?.summary||'')==='1';
    const from=dateOnly(req.query?.from,londonDate(-30)),to=dateOnly(req.query?.to,londonDate(7));
    const lo=ts(from+'T00:00:00Z'),hi=ts(to+'T23:59:59Z'),warnings=[];
    const safe=async(label,p)=>{try{return await p}catch(e){warnings.push(label+': '+(e.message||String(e)));return[]}};
    const [allFixtures,priorityTeams,worker,budget]=await Promise.all([
      safe('fixtures',db.select('mi_fixtures','select=*&order=kickoff.asc&limit=1500')),
      safe('priorityTeams',db.select('mi_priority_teams','active=eq.true&select=team_id,name,logo,kind,source,tier,priority,fifa_rank,active&order=priority.asc&limit=300')),
      safe('worker',db.select('mi_worker_state','state_key=eq.main&select=payload,updated_at&limit=1')),
      safe('budget',db.select('mi_api_usage',`usage_date=eq.${londonDate()}&select=calls,updated_at,last_reason&limit=1`))
    ]);
    const fixtures=(allFixtures||[]).filter(f=>{const t=ts(f.kickoff);return t>=lo&&t<=hi});
    if(summary){
      const ids=fixtures.map(x=>Number(x.fixture_id)).filter(Number.isFinite),inq=ids.length?`(${ids.join(',')})`:null;
      const preds=inq?await safe('predictions',db.select('mi_predictions',`fixture_id=in.${inq}&select=fixture_id,stage,lineup_confirmed`)):[];
      const c={stored:(allFixtures||[]).length,window:fixtures.length,predictions:preds.length,scout:preds.filter(x=>x.stage==='scout').length,deep:preds.filter(x=>x.stage==='deep').length,final:preds.filter(x=>x.stage==='final'||x.lineup_confirmed).length};
      return res.status(200).json({configured:true,version:'v16.5-state',counts:c,workerState:worker?.[0]||null,budget:budget?.[0]||{calls:0},warnings});
    }
    const ids=fixtures.map(x=>Number(x.fixture_id)).filter(Number.isFinite),inq=ids.length?`(${ids.join(',')})`:null;
    const [predictions,stages,lineups]=await Promise.all([
      inq?safe('predictions',db.select('mi_predictions',`fixture_id=in.${inq}&select=fixture_id,model_version,stage,lineup_confirmed,payload,generated_at,updated_at`)):[],
      inq?safe('stages',db.select('mi_prediction_stages',`fixture_id=in.${inq}&select=fixture_id,model_version,stage,lineup_confirmed,payload,generated_at,updated_at`)):[],
      inq?safe('lineups',db.select('mi_lineups',`fixture_id=in.${inq}&select=fixture_id,confirmed,checked_at`)):[]
    ]);
    return res.status(200).json({configured:true,version:'v16.5-state',fixtures:fixtures.map(compactFixture),predictions:(predictions||[]).map(compactPrediction),predictionStages:(stages||[]).map(compactPrediction),lineups:lineups||[],priorityTeams:priorityTeams||[],workerState:worker?.[0]||null,budget:budget?.[0]||{calls:0},warnings,counts:{stored:(allFixtures||[]).length,window:fixtures.length,predictions:(predictions||[]).length,stages:(stages||[]).length}});
  }catch(e){return res.status(200).json({configured:true,version:'v16.5-state',fixtures:[],predictions:[],predictionStages:[],lineups:[],priorityTeams:[],workerState:null,budget:null,warnings:['state fallback: '+(e.message||String(e))],counts:{stored:0,window:0,predictions:0,stages:0}})}
}
