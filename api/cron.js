const db=require('./_db');
const {cachedApiFootball}=require('./_cache');

const SUPPORTED=new Set([39,40,41,42,45,48,2,3,848,179,140,78,135,61,88,94,144,203]);
const LIVE=new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const DONE=new Set(['FT','AET','PEN']);
const rows=d=>Array.isArray(d?.response)?d.response:[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function londonDate(offset=0){const d=new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
function fixtureRow(f){return{fixture_id:f.fixture.id,league_id:f.league?.id||null,competition:f.league?.name||'',kickoff:f.fixture.date,status:f.fixture.status?.short||'',minute:f.fixture.status?.elapsed??null,home_team_id:f.teams?.home?.id||null,home_team:f.teams?.home?.name||'',away_team_id:f.teams?.away?.id||null,away_team:f.teams?.away?.name||'',home_score:f.goals?.home??null,away_score:f.goals?.away??null,payload:f,updated_at:new Date().toISOString()}}
function confirmedLineup(d){const r=rows(d);return r.length>=2&&r.filter(x=>Array.isArray(x?.startXI)&&x.startXI.length>=11).length>=2}
async function one(table,id,fields='*'){const r=await db.select(table,`fixture_id=eq.${id}&select=${encodeURIComponent(fields)}&limit=1`);return Array.isArray(r)?r[0]||null:null}
function siteBase(){const h=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;return h?`https://${h}`:process.env.SITE_URL||''}
async function runPrediction(f,mode){const base=siteBase();if(!base)throw new Error('No production URL available for background prediction');const r=await fetch(base+'/api/predict',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureId:String(f.fixture.id),homeTeam:f.teams.home.name,awayTeam:f.teams.away.name,homeTeamId:f.teams.home.id,awayTeamId:f.teams.away.id,competition:f.league.name,fixtureDate:f.fixture.date,leagueId:f.league.id,season:f.league.season,mode})});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||`Prediction HTTP ${r.status}`);await db.upsert('mi_predictions',{fixture_id:f.fixture.id,model_version:d.model||'',stage:d.analysisStage||mode,lineup_confirmed:!!d.lineupConfirmed,payload:d,generated_at:new Date().toISOString(),updated_at:new Date().toISOString()},'fixture_id');return d}
function correct(rule,h,a){const t=h+a;if(rule==='home0.5')return h>=1;if(rule==='away0.5')return a>=1;if(rule==='over1.5')return t>=2;if(rule==='over2.5')return t>=3;if(rule==='under3.5')return t<=3;if(rule==='under4.5')return t<=4;if(rule==='btts')return h>0&&a>0;if(rule==='homeOrDraw')return h>=a;if(rule==='awayOrDraw')return a>=h;if(rule==='homeWin')return h>a;if(rule==='draw')return h===a;if(rule==='awayWin')return a>h;return false}
async function settleCompleted(fixtures){
  let settled=0;
  for(const f of fixtures.filter(x=>DONE.has(x.fixture.status?.short)&&Number.isFinite(Number(x.goals?.home))&&Number.isFinite(Number(x.goals?.away)))){
    const p=await one('mi_predictions',f.fixture.id,'fixture_id,model_version,stage,lineup_confirmed,payload,generated_at');
    if(!p?.payload?.predictions?.length)continue;
    const h=Number(f.goals.home),a=Number(f.goals.away),model=p.model_version||p.payload.model||'v15-match-intelligence-coherent';
    const auditRows=(p.payload.predictions||[]).map(x=>{const key=`${f.fixture.id}|${x.rule}|${model}`;return{audit_key:key,payload:{key,fixtureId:String(f.fixture.id),rule:x.rule,type:x.type,title:x.title,fixture:`${f.teams.home.name} v ${f.teams.away.name}`,competition:f.league?.name||'',kickoff:f.fixture.date,p:x.p,rawP:x.rawP??x.p,confidence:x.stats?.dataConfidence??null,agreement:x.stats?.engineAgreement??null,lineupConfirmed:!!(x.stats?.lineupConfirmed||p.lineup_confirmed),preLineupP:x.stats?.preLineupP??null,lineupDelta:x.stats?.lineupDelta??null,stage:x.stats?.analysisStage||p.stage||null,engines:x.stats?.engineProbabilities||null,ablation:x.stats?.ablation||null,model,origin:'server',correct:correct(x.rule,h,a),result:`${h}-${a}`,settledAt:new Date().toISOString()},updated_at:new Date().toISOString()}});
    if(auditRows.length){await db.upsert('mi_model_audit',auditRows,'audit_key');settled+=auditRows.length}
  }
  return settled;
}
function topProb(pred){return Math.max(0,...((pred?.payload?.predictions||[]).map(x=>Number(x.p)||0)))}

module.exports=async function handler(req,res){
  const auth=req.headers?.authorization||req.headers?.Authorization;
  if(!process.env.CRON_SECRET||auth!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({ok:false,error:'Unauthorized'});
  if(!db.configured())return res.status(503).json({ok:false,error:'Supabase is not configured'});
  let runId=null,seen=0,lineupsChecked=0,predictionsRun=0,settled=0;
  try{
    const locked=await db.rpc('mi_try_engine_lock',{p_seconds:105});const ok=Array.isArray(locked)?locked[0]:locked;if(!ok)return res.status(200).json({ok:true,skipped:'engine already running'});
    const rr=await db.insert('mi_engine_runs',{started_at:new Date().toISOString(),status:'running'});runId=rr?.[0]?.id||null;
    const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');
    const today=londonDate(),now=Date.now();
    const known=await db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(today+'T00:00:00Z')}&kickoff=lt.${encodeURIComponent(today+'T23:59:59Z')}&select=kickoff,status,updated_at`).catch(()=>[]);
    const activeWindow=(known||[]).some(x=>{const m=(new Date(x.kickoff).getTime()-now)/60000;return !DONE.has(x.status)&&m<=120&&m>=-180});
    const fixtureTtl=activeWindow?120000:600000;
    const fd=await cachedApiFootball(`/fixtures?date=${today}&timezone=Europe%2FLondon`,key,{ttlMs:fixtureTtl,reason:'cron:daily-fixtures',critical:true});
    const fixtures=rows(fd).filter(f=>SUPPORTED.has(Number(f?.league?.id)));seen=fixtures.length;
    if(fixtures.length)await db.upsert('mi_fixtures',fixtures.map(fixtureRow),'fixture_id');
    // Keep the rolling 7-day fixture window warm with a long cache. This is cheap: cache hits use zero upstream calls.
    for(let off=1;off<=7;off++){
      const day=londonDate(off);
      const future=await cachedApiFootball(`/fixtures?date=${day}&timezone=Europe%2FLondon`,key,{ttlMs:21600000,reason:'cron:future-fixtures',critical:false});
      const fr=rows(future).filter(f=>SUPPORTED.has(Number(f?.league?.id)));
      if(fr.length)await db.upsert('mi_fixtures',fr.map(fixtureRow),'fixture_id');
    }

    // Efficient lineup sweep: one API request can cover up to 20 fixtures.
    const near=fixtures.filter(f=>{const m=(new Date(f.fixture.date).getTime()-now)/60000;return !DONE.has(f.fixture.status?.short)&&m<=80&&m>=-30}).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date));
    const pending=[];
    for(const f of near){const old=await one('mi_lineups',f.fixture.id,'confirmed,checked_at');const age=old?.checked_at?now-new Date(old.checked_at).getTime():Infinity;const m=(new Date(f.fixture.date).getTime()-now)/60000;const due=age>((m<=25)?120000:(m<=50?240000:600000));if(!old?.confirmed&&due)pending.push(f)}
    for(let i=0;i<pending.length;i+=20){
      const group=pending.slice(i,i+20),ids=group.map(f=>f.fixture.id).join('-');
      const bulk=await cachedApiFootball(`/fixtures?ids=${ids}&timezone=Europe%2FLondon`,key,{ttlMs:120000,reason:'cron:lineup-bulk',critical:true});
      const byId=new Map(rows(bulk).map(x=>[Number(x?.fixture?.id),x]));
      for(const f of group){const enriched=byId.get(Number(f.fixture.id)),ld={response:Array.isArray(enriched?.lineups)?enriched.lineups:[]};await db.upsert('mi_lineups',{fixture_id:f.fixture.id,confirmed:confirmedLineup(ld),payload:ld,checked_at:new Date().toISOString()},'fixture_id');lineupsChecked++}
    }
    // Dedicated provider fallback only in the final 25 minutes, rotated across up to 10 fixtures per run.
    const urgent=[];
    for(const f of near){const m=(new Date(f.fixture.date).getTime()-now)/60000;if(m>25||m<-10)continue;const l=await one('mi_lineups',f.fixture.id,'confirmed');if(!l?.confirmed)urgent.push(f)}
    for(const f of urgent.slice(0,10)){
      const ld=await cachedApiFootball(`/fixtures/lineups?fixture=${f.fixture.id}`,key,{ttlMs:120000,reason:'cron:lineup-direct',critical:true});
      await db.upsert('mi_lineups',{fixture_id:f.fixture.id,confirmed:confirmedLineup(ld),payload:ld,checked_at:new Date().toISOString()},'fixture_id');lineupsChecked++;
    }

    settled=await settleCompleted(fixtures);

    // Modelling queue. Confirmed XIs first; otherwise build one useful snapshot per run.
    const finals=[];
    for(const f of near){const l=await one('mi_lineups',f.fixture.id,'confirmed');const p=await one('mi_predictions',f.fixture.id,'stage,lineup_confirmed,payload,updated_at');if(l?.confirmed&&(!p?.lineup_confirmed||p?.stage!=='final'))finals.push(f)}
    for(const f of finals.slice(0,2)){try{await runPrediction(f,'deep');predictionsRun++}catch(e){console.error('final prediction',e.message)}}
    if(!predictionsRun){
      let target=null,mode='scout';
      for(const f of fixtures.filter(x=>{const m=(new Date(x.fixture.date).getTime()-now)/60000;return m>20&&m<=36*60&&['NS','TBD'].includes(x.fixture.status?.short)}).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date))){const p=await one('mi_predictions',f.fixture.id,'stage,payload,updated_at');if(!p){target=f;mode='scout';break}if(p.stage==='scout'&&topProb(p)>=70){target=f;mode='deep';break}}
      if(target){try{await runPrediction(target,mode);predictionsRun++}catch(e){console.error('background prediction',e.message)}}
    }

    if(runId)await db.upsert('mi_engine_runs',{id:runId,finished_at:new Date().toISOString(),status:'ok',fixtures_seen:seen,lineups_checked:lineupsChecked,live_checked:0,predictions_run:predictionsRun,note:`${today}; settled=${settled}`},'id');
    const budget=await db.select('mi_api_usage',`usage_date=eq.${today}&select=calls,updated_at,last_reason&limit=1`).catch(()=>[]);
    return res.status(200).json({ok:true,date:today,fixtures:seen,lineupsChecked,predictionsRun,settled,budget:budget?.[0]||null});
  }catch(e){if(runId)await db.upsert('mi_engine_runs',{id:runId,finished_at:new Date().toISOString(),status:'error',fixtures_seen:seen,lineups_checked:lineupsChecked,live_checked:0,predictions_run:predictionsRun,note:String(e.message||e).slice(0,500)},'id').catch(()=>{});return res.status(500).json({ok:false,error:e.message||String(e),budget:e.budget||null})}
}
