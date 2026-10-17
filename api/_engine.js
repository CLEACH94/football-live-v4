const db=require('./_db');
const {cachedApiFootball}=require('./_cache');

const DONE=new Set(['FT','AET','PEN']);
const LIVE=new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
const ENGLISH_LEAGUES=[
  {id:39,name:'Premier League',tier:1,base:100},
  {id:40,name:'Championship',tier:2,base:200},
  {id:41,name:'League One',tier:3,base:300},
  {id:42,name:'League Two',tier:4,base:400},
  {id:43,name:'National League',tier:5,base:500}
];
// Official FIFA men's ranking snapshot published 7 October 2026.
const FIFA_TOP_50=[
'Spain','Argentina','France','England','Portugal','Brazil','Morocco','Belgium','Netherlands','Mexico',
'Colombia','Switzerland','Germany','Croatia','Italy','USA','Japan','Senegal','Norway','Uruguay',
'Denmark','Austria','Iran','Ecuador','Egypt','Australia','Canada','Algeria','Ivory Coast','Nigeria',
'Türkiye','South Korea','Paraguay','Sweden','Russia','Ukraine','Poland','Hungary','Wales','Congo DR',
'Greece','Cameroon','Scotland','Serbia','Slovakia','Panama','Mali','South Africa','Venezuela','Chile'
];
const HOME_NATIONS=['England','Scotland','Wales','Northern Ireland'];
const INTERNATIONAL_ALIASES={
  'Türkiye':['Turkey','Turkiye'],
  'South Korea':['Korea Republic','Korea Rep','Korea, South'],
  'Ivory Coast':["Côte d'Ivoire",'Cote d Ivoire'],
  'Congo DR':['DR Congo','Congo DR','Congo, Democratic Republic'],
  'USA':['United States','United States of America']
};
const rows=d=>Array.isArray(d?.response)?d.response:[];
const iso=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function londonDate(offset=0){const d=new Date(Date.now()+offset*86400000),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`}
function seasonFor(){const d=new Date();return d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1}
function fixtureRow(f){return{fixture_id:Number(f?.fixture?.id),league_id:Number(f?.league?.id)||null,competition:f?.league?.name||'',kickoff:f?.fixture?.date||null,status:f?.fixture?.status?.short||'',minute:f?.fixture?.status?.elapsed??null,home_team_id:Number(f?.teams?.home?.id)||null,home_team:f?.teams?.home?.name||'',away_team_id:Number(f?.teams?.away?.id)||null,away_team:f?.teams?.away?.name||'',home_score:f?.goals?.home??null,away_score:f?.goals?.away??null,payload:f,updated_at:iso()}}
function confirmedLineup(d){const r=rows(d);return r.length>=2&&r.filter(x=>Array.isArray(x?.startXI)&&x.startXI.length>=11).length>=2}
async function one(table,id,fields='*'){const r=await db.select(table,`fixture_id=eq.${id}&select=${encodeURIComponent(fields)}&limit=1`);return Array.isArray(r)?r[0]||null:null}
async function mapLimit(items,limit,fn){let i=0;const out=new Array(items.length);async function w(){while(i<items.length){const n=i++;try{out[n]=await fn(items[n],n)}catch(e){out[n]={error:e.message||String(e)}}}}await Promise.all(Array.from({length:Math.min(limit,items.length||1)},w));return out}
function siteBase(){const h=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;return h?`https://${h}`:process.env.SITE_URL||''}
function teamNameMatch(a,b){return String(a||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()===String(b||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}

async function ensureDomesticPool(key){
  const season=seasonFor(),up=[];
  for(const league of ENGLISH_LEAGUES){
    const d=await cachedApiFootball(`/teams?league=${league.id}&season=${season}`,key,{ttlMs:86400000,reason:`pool:league-${league.id}`,critical:false});
    const list=rows(d).filter(x=>x?.team?.id).sort((a,b)=>String(a.team.name).localeCompare(String(b.team.name)));
    list.forEach((x,i)=>up.push({team_id:Number(x.team.id),name:x.team.name,logo:x.team.logo||null,kind:'club',source:league.name,tier:league.tier,priority:teamNameMatch(x.team.name,'Oxford United')?0:league.base+i,fifa_rank:null,active:true,updated_at:iso()}));
  }
  if(up.length)await db.upsert('mi_priority_teams',up,'team_id');
  return up.length;
}
async function resolvedInternationalNames(){const r=await db.select('mi_priority_teams',`kind=eq.international&select=name`);return new Set((r||[]).map(x=>x.name))}
async function resolveInternationalPool(key,max=8){
  const official=[...FIFA_TOP_50,...HOME_NATIONS.filter(x=>!FIFA_TOP_50.includes(x))],done=await resolvedInternationalNames();
  const todo=official.filter(n=>!done.has(n)).slice(0,max),up=[];
  for(const name of todo){
    const searches=[name,...(INTERNATIONAL_ALIASES[name]||[])];
    let exact=null;
    for(const searchName of searches){
      const q=encodeURIComponent(searchName),d=await cachedApiFootball(`/teams?search=${q}`,key,{ttlMs:2592000000,reason:'pool:international',critical:false});
      const cand=rows(d).filter(x=>x?.team?.id&&x?.team?.national===true);
      exact=cand.find(x=>teamNameMatch(x.team.name,name)||searches.some(a=>teamNameMatch(x.team.name,a)))||cand[0]||null;
      if(exact)break;
    }
    if(exact){const rank=FIFA_TOP_50.indexOf(name)+1;up.push({team_id:Number(exact.team.id),name:name,logo:exact.team.logo||null,kind:'international',source:'FIFA official 2026-10-07',tier:null,priority:1000+(rank>0?rank:99),fifa_rank:rank>0?rank:null,active:true,updated_at:iso()})}
    await sleep(35);
  }
  if(up.length)await db.upsert('mi_priority_teams',up,'team_id');
  return {resolved:up.length,remaining:Math.max(0,official.length-done.size-up.length)};
}
async function getWorkerState(){const r=await db.select('mi_worker_state','state_key=eq.main&select=payload&limit=1').catch(()=>[]);return r?.[0]?.payload||{discoveryCursor:0,cycle:0}}
async function putWorkerState(payload){await db.upsert('mi_worker_state',{state_key:'main',payload,updated_at:iso()},'state_key')}
async function releaseEngineLock(){await db.upsert('mi_engine_lock',{lock_name:'main',locked_until:'1970-01-01T00:00:00.000Z',updated_at:iso()},'lock_name').catch(()=>{})}
async function priorityTeams(){return await db.select('mi_priority_teams','active=eq.true&select=*&order=priority.asc')}
async function discoverFixtures(key,teams,{maxTeams=25,fullCycle=false,focusOxford=false,includeRecent=false}={}){
  if(!teams.length)return{teamsProcessed:0,fixturesFound:0,cursor:0,cycleComplete:false,errors:[]};
  const state=await getWorkerState();let cursor=fullCycle?0:Number(state.discoveryCursor||0);if(cursor>=teams.length)cursor=0;
  let batch=[],n=0;
  if(focusOxford){const ox=teams.find(t=>teamNameMatch(t.name,'Oxford United'));if(ox)batch=[ox];n=batch.length}else{n=fullCycle?teams.length:Math.min(maxTeams,teams.length);for(let j=0;j<n;j++)batch.push(teams[(cursor+j)%teams.length])}

  // Team-first by design. Use API-Football's purpose-built team schedule queries rather
  // than a broad from/to window. This spans every competition automatically and avoids
  // provider date-window limits. Upcoming and recent calls are cached for two hours.
  const result=await mapLimit(batch,4,async t=>{
    try{
      const upcoming=await cachedApiFootball(`/fixtures?team=${t.team_id}&next=12&timezone=Europe%2FLondon`,key,{ttlMs:7200000,reason:`discover:next-${t.team_id}`,critical:false});
      let recent={response:[]};
      if(includeRecent)recent=await cachedApiFootball(`/fixtures?team=${t.team_id}&last=8&timezone=Europe%2FLondon`,key,{ttlMs:21600000,reason:`discover:last-${t.team_id}`,critical:false});
      return {team:t,rows:[...rows(recent),...rows(upcoming)]};
    }catch(e){return {team:t,error:e?.message||String(e),rows:[]}}
  });

  const map=new Map(),errors=[];
  for(const item of result){
    if(item?.error){errors.push(`${item.team?.name||item.team?.team_id}: ${item.error}`);continue}
    for(const f of item?.rows||[]){if(f?.fixture?.id)map.set(Number(f.fixture.id),f)}
  }
  const minTs=Date.now()-30*86400000,maxTs=Date.now()+8*86400000;
  const fixtures=[...map.values()].filter(f=>{const ts=new Date(f?.fixture?.date||0).getTime();return Number.isFinite(ts)&&ts>=minTs&&ts<=maxTs});
  if(fixtures.length)await db.upsert('mi_fixtures',fixtures.map(fixtureRow),'fixture_id');

  const next=focusOxford?cursor:(cursor+n)%teams.length,cycleComplete=!focusOxford&&(next===0||n>=teams.length);
  await putWorkerState({...state,discoveryCursor:next,cycle:Number(state.cycle||0)+(cycleComplete?1:0),lastDiscoveryAt:iso(),lastDiscoveryCount:fixtures.length,lastTeam:batch.at(-1)?.name||null,lastDiscoveryErrors:errors.slice(0,5)});
  return{teamsProcessed:batch.length,fixturesFound:fixtures.length,cursor:next,cycleComplete,focusOxford:!!focusOxford,errors:errors.slice(0,5)};
}

async function refreshNearKickoff(key){
  // API-Football publishes confirmed line-ups close to kick-off. Poll the dedicated
  // line-up endpoint rather than assuming the generic fixtures response embeds XI data.
  // These calls are critical and may use the protected reserve after normal work stops.
  const now=Date.now(),from=new Date(now-45*60000).toISOString(),to=new Date(now+95*60000).toISOString();
  const dbRows=await db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(from)}&kickoff=lte.${encodeURIComponent(to)}&select=*&order=kickoff.asc`).catch(()=>[]);
  const pending=[];
  for(const r of dbRows||[]){
    if(DONE.has(r.status))continue;
    const old=await one('mi_lineups',r.fixture_id,'confirmed,checked_at');
    if(old?.confirmed)continue;
    const mins=(new Date(r.kickoff)-now)/60000;
    if(mins>95)continue;
    const age=old?.checked_at?now-new Date(old.checked_at).getTime():Infinity;
    const cadence=mins<=25?2*60000:mins<=50?4*60000:8*60000;
    if(age>=cadence)pending.push(r);
  }
  pending.sort((a,b)=>{
    const ao=/^Oxford United$/i.test(a.home_team)||/^Oxford United$/i.test(a.away_team);
    const bo=/^Oxford United$/i.test(b.home_team)||/^Oxford United$/i.test(b.away_team);
    return Number(bo)-Number(ao)||new Date(a.kickoff)-new Date(b.kickoff);
  });
  let checked=0,confirmed=0;
  for(const f of pending.slice(0,30)){
    try{
      const d=await cachedApiFootball(`/fixtures/lineups?fixture=${f.fixture_id}`,key,{ttlMs:120000,reason:`lineups:${f.fixture_id}`,critical:true,force:false});
      const ok=confirmedLineup(d);
      await db.upsert('mi_lineups',{fixture_id:f.fixture_id,confirmed:ok,payload:d,checked_at:iso()},'fixture_id');
      checked++;if(ok)confirmed++;
    }catch(e){
      // Do not erase a previous line-up record when a provider call fails.
      if(e?.code==='API_BUDGET')throw e;
    }
  }
  return{checked,confirmed,pending:pending.length};
}

async function runPrediction(f,mode){
  const base=siteBase();if(!base)throw new Error('No production URL available for prediction worker');
  const raw=f.payload||{},homeId=f.home_team_id||raw?.teams?.home?.id,awayId=f.away_team_id||raw?.teams?.away?.id;
  const body={fixtureId:String(f.fixture_id),homeTeam:f.home_team,awayTeam:f.away_team,homeTeamId:homeId,awayTeamId:awayId,competition:f.competition,fixtureDate:f.kickoff,leagueId:f.league_id,season:raw?.league?.season||seasonFor(),mode};
  const r=await fetch(base+'/api/predict',{method:'POST',headers:{'content-type':'application/json','x-match-index-worker':'1'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||`Prediction HTTP ${r.status}`);
  const stage=d.lineupConfirmed?'final':(d.analysisStage||mode),row={fixture_id:f.fixture_id,model_version:d.model||'',stage,lineup_confirmed:!!d.lineupConfirmed,payload:d,generated_at:iso(),updated_at:iso()};
  await db.upsert('mi_predictions',row,'fixture_id');await db.upsert('mi_prediction_stages',{fixture_id:f.fixture_id,stage,model_version:d.model||'',lineup_confirmed:!!d.lineupConfirmed,payload:d,generated_at:iso(),updated_at:iso()},'fixture_id,stage');return d;
}
function teamPriorityMap(teams){return new Map(teams.map(x=>[Number(x.team_id),Number(x.priority)]))}
async function predictionQueue(teams,maxJobs=3,stage='auto'){
  const today=londonDate(),to=londonDate(7),fx=await db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(today+'T00:00:00Z')}&kickoff=lt.${encodeURIComponent(to+'T23:59:59Z')}&select=*&order=kickoff.asc`).catch(()=>[]),pm=teamPriorityMap(teams),jobs=[];
  for(const f of fx||[]){
    if(DONE.has(f.status)||LIVE.has(f.status))continue;
    const cur=await one('mi_predictions',f.fixture_id,'stage,lineup_confirmed,updated_at'),lin=await one('mi_lineups',f.fixture_id,'confirmed');
    let mode=null;if(stage==='scout'){if(!cur)mode='scout'}else if(stage==='deep'){if(cur?.stage==='scout'&&!lin?.confirmed)mode='deep'}else if(stage==='final'){if(lin?.confirmed&&(!cur?.lineup_confirmed||cur.stage!=='final'))mode='deep'}else{if(lin?.confirmed&&(!cur?.lineup_confirmed||cur.stage!=='final'))mode='deep';else if(!cur)mode='scout';else if(cur.stage==='scout')mode='deep'}if(!mode)continue;
    const ox=/^Oxford United$/i.test(f.home_team)||/^Oxford United$/i.test(f.away_team),pri=Math.min(pm.get(Number(f.home_team_id))??9999,pm.get(Number(f.away_team_id))??9999),isIntl=pri>=1000,finalXi=!!lin?.confirmed;
    // Queue order: confirmed XI first; Oxford first; then all domestic Initial forecasts
    // before domestic Deep Dive; internationals follow. This keeps broad coverage visible
    // before spending the expensive layer on matches lower in the user's priority order.
    let group=finalXi?-300000:ox?(mode==='scout'?-200000:-150000):!isIntl?(mode==='scout'?0:100000):(mode==='scout'?200000:300000);
    jobs.push({f,mode,score:group+pri*10+Math.max(0,(new Date(f.kickoff)-Date.now())/3600000)});
  }
  jobs.sort((a,b)=>a.score-b.score);let ran=0,errors=[];for(const j of jobs.slice(0,maxJobs)){try{await runPrediction(j.f,j.mode);ran++}catch(e){errors.push(`${j.f.home_team} v ${j.f.away_team}: ${e.message}`)}}return{ran,queued:jobs.length,errors:errors.slice(0,5)};
}
function correct(rule,h,a){const t=h+a;if(rule==='home0.5')return h>=1;if(rule==='away0.5')return a>=1;if(rule==='home1.5')return h>=2;if(rule==='away1.5')return a>=2;if(rule==='over1.5')return t>=2;if(rule==='over2.5')return t>=3;if(rule==='under3.5')return t<=3;if(rule==='under4.5')return t<=4;if(rule==='btts')return h>0&&a>0;if(rule==='homeCleanSheet')return a===0;if(rule==='awayCleanSheet')return h===0;if(rule==='homeOrDraw')return h>=a;if(rule==='awayOrDraw')return a>=h;if(rule==='homeWin')return h>a;if(rule==='draw')return h===a;if(rule==='awayWin')return a>h;if(String(rule).startsWith('exact:'))return String(rule).slice(6)===`${h}-${a}`;return null}
async function settleRecent(){
  const from=londonDate(-30),to=londonDate(),fx=await db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(from+'T00:00:00Z')}&kickoff=lt.${encodeURIComponent(to+'T23:59:59Z')}&status=in.(FT,AET,PEN)&select=*`).catch(()=>[]);let settled=0;
  const existingRows=await db.select('mi_model_audit','select=audit_key&limit=20000').catch(()=>[]),existing=new Set((existingRows||[]).map(x=>x.audit_key));
  for(const f of fx||[]){
    const stages=await db.select('mi_prediction_stages',`fixture_id=eq.${f.fixture_id}&select=*`).catch(()=>[]);
    for(const s of stages||[]){
      const p=s.payload;if(!p?.predictions?.length)continue;const h=Number(f.home_score),a=Number(f.away_score);if(!Number.isFinite(h)||!Number.isFinite(a))continue;
      const model=s.model_version||p.model||'unknown',audit=[];
      for(const x of p.predictions||[]){const key=`${f.fixture_id}|${s.stage}|${x.rule}|${model}`;if(existing.has(key))continue;const outcome=correct(x.rule,h,a);if(outcome===null)continue;audit.push({audit_key:key,payload:{key,fixtureId:String(f.fixture_id),rule:x.rule,type:x.type,title:x.title,fixture:`${f.home_team} v ${f.away_team}`,competition:f.competition,kickoff:f.kickoff,p:x.p,rawP:x.rawP??x.p,stage:s.stage,lineupConfirmed:!!s.lineup_confirmed,model,origin:'server',correct:outcome,result:`${h}-${a}`,settledAt:iso()},updated_at:iso()});existing.add(key)}
      if(audit.length){await db.upsert('mi_model_audit',audit,'audit_key');settled+=audit.length}
    }
  }
  return settled;
}

async function manualLineupSearch({tier,sourceName,maxFixtures=24}={}){
  if(!db.configured())throw new Error('Turso is not configured');
  const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');
  const teams=await priorityTeams();
  const selected=teams.filter(t=>t.kind==='club'&&(tier?Number(t.tier)===Number(tier):sourceName?String(t.source)===String(sourceName):false));
  const ids=new Set(selected.map(t=>Number(t.team_id)));
  const now=Date.now(),from=new Date(now-45*60000).toISOString(),to=new Date(now+150*60000).toISOString();
  const fx=await db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(from)}&kickoff=lte.${encodeURIComponent(to)}&select=*&order=kickoff.asc`).catch(()=>[]);
  const target=(fx||[]).filter(f=>ids.has(Number(f.home_team_id))||ids.has(Number(f.away_team_id))).slice(0,maxFixtures);
  let checked=0,confirmed=0,updated=0,errors=[];
  for(const f of target){
    try{
      const d=await cachedApiFootball(`/fixtures/lineups?fixture=${f.fixture_id}`,key,{ttlMs:120000,reason:`manual-lineups:${f.fixture_id}`,critical:true,force:true});
      const ok=confirmedLineup(d);await db.upsert('mi_lineups',{fixture_id:f.fixture_id,confirmed:ok,payload:d,checked_at:iso()},'fixture_id');checked++;
      if(ok){confirmed++;await runPrediction(f,'deep');updated++}
    }catch(e){errors.push(`${f.home_team} v ${f.away_team}: ${e.message||e}`)}
  }
  return{ok:true,tier:Number(tier)||null,sourceName:sourceName||null,teams:selected.length,fixtures:target.length,checked,confirmed,updated,errors:errors.slice(0,5)};
}

async function runWorker({maxTeams=8,maxPredictions=2,fullCycle=false,source='browser',focusOxford=false,phase='auto'}={}){
  if(!db.configured())throw new Error('Turso is not configured');
  const key=process.env.API_FOOTBALL_KEY;if(!key)throw new Error('API_FOOTBALL_KEY is not configured');
  const lockSeconds=source==='browser'?70:285;
  const locked=await db.rpc('mi_try_engine_lock',{p_seconds:lockSeconds});const ok=Array.isArray(locked)?locked[0]:locked;
  if(!ok)return{ok:true,skipped:'engine already running'};
  const started=Date.now();let runId=null;
  try{const rr=await db.insert('mi_engine_runs',{started_at:iso(),status:'running',note:`v16.4 ${source} ${phase}`});runId=rr?.[0]?.id||null}catch{}
  try{
    let teams=await priorityTeams();let domestic=teams.filter(t=>t.kind==='club').length;
    if(domestic<100){domestic=await ensureDomesticPool(key);teams=await priorityTeams()}
    let discovery={teamsProcessed:0,fixturesFound:0,cursor:(await getWorkerState()).discoveryCursor||0,cycleComplete:false,errors:[]};
    let predictions={ran:0,queued:0,errors:[]};
    let lineups={checked:0,confirmed:0,pending:0,deferred:true};
    if(phase==='discover'||phase==='auto')discovery=await discoverFixtures(key,teams,{maxTeams,fullCycle,focusOxford,includeRecent:source!=='browser'});
    if(phase==='scout'||phase==='auto')predictions=await predictionQueue(teams,maxPredictions,'scout');
    if(phase==='deep')predictions=await predictionQueue(teams,maxPredictions,'deep');
    let intl={resolved:0,remaining:Math.max(0,FIFA_TOP_50.length+HOME_NATIONS.filter(x=>!FIFA_TOP_50.includes(x)).length-teams.filter(t=>t.kind==='international').length),deferred:true};
    if(source!=='browser'&&discovery.cycleComplete){intl=await resolveInternationalPool(key,60);teams=await priorityTeams()}
    const settled=source==='browser'?0:await settleRecent();
    const budget=(await db.select('mi_api_usage',`usage_date=eq.${londonDate()}&select=calls,last_reason,updated_at&limit=1`).catch(()=>[]))?.[0]||{calls:0};
    const out={ok:true,version:'v16.4-fast-pass',source,phase,domesticTeams:domestic,international:intl,priorityTeams:teams.length,discovery,lineups,predictions,settled,budget,durationMs:Date.now()-started};
    if(runId)await db.upsert('mi_engine_runs',{id:runId,finished_at:iso(),status:'ok',fixtures_seen:discovery.fixturesFound,lineups_checked:0,live_checked:0,predictions_run:predictions.ran,note:JSON.stringify({source,phase,teams:discovery.teamsProcessed}).slice(0,500)},'id').catch(()=>{});
    return out;
  }catch(e){if(runId)await db.upsert('mi_engine_runs',{id:runId,finished_at:iso(),status:'error',note:String(e.message||e).slice(0,500)},'id').catch(()=>{});throw e}
  finally{await releaseEngineLock()}
}

module.exports={runWorker,manualLineupSearch,FIFA_TOP_50,HOME_NATIONS,ENGLISH_LEAGUES};
