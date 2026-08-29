const db=require('./_db');
const {apiFootball}=require('./_quota');

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
module.exports=async function handler(req,res){
  const auth=req.headers?.authorization||req.headers?.Authorization;
  if(!process.env.CRON_SECRET||auth!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({ok:false,error:'Unauthorized'});
  if(!db.configured())return res.status(503).json({ok:false,error:'Supabase is not configured'});
  let runId=null,seen=0,lineupsChecked=0,liveChecked=0,predictionsRun=0;
  try{
    const locked=await db.rpc('mi_try_engine_lock',{p_seconds:105});
    const ok=Array.isArray(locked)?locked[0]:locked;if(!ok)return res.status(200).json({ok:true,skipped:'engine already running'});
    const rr=await db.insert('mi_engine_runs',{started_at:new Date().toISOString(),status:'running'});runId=rr?.[0]?.id||null;
    const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');
    const today=londonDate();
    const fd=await apiFootball(`/fixtures?date=${today}&timezone=Europe%2FLondon`,key,{reason:'cron:daily-fixtures',critical:true});
    const fixtures=rows(fd).filter(f=>SUPPORTED.has(Number(f?.league?.id)));
    seen=fixtures.length;if(fixtures.length)await db.upsert('mi_fixtures',fixtures.map(fixtureRow),'fixture_id');
    const now=Date.now();
    // 1) Lineups: sweep the whole near-kickoff window efficiently.
    // API-Football supports up to 20 fixture IDs in one enriched fixture call; those payloads can include lineups.
    const lineupCandidates=fixtures.filter(f=>{const ko=new Date(f.fixture.date).getTime(),mins=(ko-now)/60000;return !DONE.has(f.fixture.status?.short)&&mins<=90&&mins>=-60}).sort((a,b)=>Math.abs(new Date(a.fixture.date)-now)-Math.abs(new Date(b.fixture.date)-now));
    const pending=[];
    for(const f of lineupCandidates){const old=await one('mi_lineups',f.fixture.id,'fixture_id,confirmed,checked_at');if(!old?.confirmed)pending.push({f,old});}
    // Bulk pass: cover every pending fixture, 20 at a time, rather than allowing a six-match queue.
    for(let i=0;i<pending.length;i+=20){
      const group=pending.slice(i,i+20),ids=group.map(x=>x.f.fixture.id).join('-');
      try{
        const bulk=await apiFootball(`/fixtures?ids=${ids}&timezone=Europe%2FLondon`,key,{reason:'cron:lineup-bulk',critical:true});
        const byId=new Map(rows(bulk).map(x=>[Number(x?.fixture?.id),x]));
        for(const {f} of group){
          const enriched=byId.get(Number(f.fixture.id)),ls=Array.isArray(enriched?.lineups)?enriched.lineups:[];
          const ld={response:ls},confirmed=confirmedLineup(ld);
          await db.upsert('mi_lineups',{fixture_id:f.fixture.id,confirmed,payload:ld,checked_at:new Date().toISOString()},'fixture_id');
          lineupsChecked++;
        }
      }catch(e){if(e.code==='API_BUDGET')break}
      await sleep(50);
    }
    // Direct pass: inside T-45, immediately hit the dedicated lineups endpoint for the most urgent misses.
    const urgent=[];
    for(const {f} of pending){
      const mins=(new Date(f.fixture.date).getTime()-now)/60000;
      if(mins<=45&&mins>=-30){const latest=await one('mi_lineups',f.fixture.id,'confirmed,checked_at');if(!latest?.confirmed)urgent.push(f)}
    }
    for(const f of urgent.slice(0,10)){
      try{const ld=await apiFootball(`/fixtures/lineups?fixture=${f.fixture.id}`,key,{reason:'cron:lineup-direct',critical:true});const confirmed=confirmedLineup(ld);await db.upsert('mi_lineups',{fixture_id:f.fixture.id,confirmed,payload:ld,checked_at:new Date().toISOString()},'fixture_id');lineupsChecked++;}catch(e){if(e.code==='API_BUDGET')break}
      await sleep(35);
    }
    // 2) Live match snapshots. Existing client now reads these instead of spending API calls itself.
    for(const f of fixtures.filter(x=>LIVE.has(x.fixture.status?.short)).slice(0,16)){
      try{const [stats,events]=await Promise.all([apiFootball(`/fixtures/statistics?fixture=${f.fixture.id}`,key,{reason:'cron:live-stats',critical:true}),apiFootball(`/fixtures/events?fixture=${f.fixture.id}`,key,{reason:'cron:live-events',critical:true})]);await db.upsert('mi_live',{fixture_id:f.fixture.id,payload:{fixture:f,stats,events,ts:Date.now()},updated_at:new Date().toISOString()},'fixture_id');liveChecked++;}catch(e){if(e.code==='API_BUDGET')break}
      await sleep(40);
    }
    // 3) Background model. One expensive model run per cron invocation, prioritising confirmed XI finals.
    let target=null,mode='deep';
    for(const f of lineupCandidates){const l=await one('mi_lineups',f.fixture.id,'confirmed');const p=await one('mi_predictions',f.fixture.id,'stage,updated_at');if(l?.confirmed&&p?.stage!=='final'){target=f;mode='deep';break}}
    if(!target){for(const f of fixtures.filter(x=>{const mins=(new Date(x.fixture.date).getTime()-now)/60000;return mins>100&&mins<=18*60&&['NS','TBD'].includes(x.fixture.status?.short)}).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date))){const p=await one('mi_predictions',f.fixture.id,'stage,updated_at');if(!p||now-new Date(p.updated_at).getTime()>8*3600000){target=f;mode='deep';break}}}
    if(target){try{await runPrediction(target,mode);predictionsRun++}catch(e){if(e.code!=='API_BUDGET')console.error('background prediction',e.message)}}
    if(runId)await db.upsert('mi_engine_runs',{id:runId,finished_at:new Date().toISOString(),status:'ok',fixtures_seen:seen,lineups_checked:lineupsChecked,live_checked:liveChecked,predictions_run:predictionsRun,note:`${today}`},'id');
    const budget=await db.select('mi_api_usage',`usage_date=eq.${today}&select=calls,updated_at&limit=1`).catch(()=>[]);
    return res.status(200).json({ok:true,date:today,fixtures:seen,lineupsChecked,liveChecked,predictionsRun,budget:budget?.[0]||null});
  }catch(e){if(runId)await db.upsert('mi_engine_runs',{id:runId,finished_at:new Date().toISOString(),status:'error',fixtures_seen:seen,lineups_checked:lineupsChecked,live_checked:liveChecked,predictions_run:predictionsRun,note:String(e.message||e).slice(0,500)},'id').catch(()=>{});return res.status(500).json({ok:false,error:e.message||String(e),budget:e.budget||null})}
}
