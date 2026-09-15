const base=(process.env.MATCH_INDEX_BASE_URL||'').replace(/\/$/,'');
if(!base) throw new Error('MATCH_INDEX_BASE_URL is required');
const leagues=[39,40,41,42,43,179,140,78,135,61,88,94,144,203,197,207,218,119,103,113,253,71,128];
const englishRank=new Map([[39,1],[40,2],[41,3],[42,4],[43,5]]);
const maxFixtures=Math.max(1,Number(process.env.MAX_FIXTURES_PER_RUN||35));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ymd=d=>d.toISOString().slice(0,10);
async function get(path){const r=await fetch(base+path,{headers:{'User-Agent':'MatchIndexWorker/16'}});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||`${path} ${r.status}`);return d}
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'MatchIndexWorker/16'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||`${path} ${r.status}`);return d}
const start=new Date(),end=new Date(Date.now()+7*86400000);
const fixtures=[];
for(const league of leagues){
  try{
    const d=await get(`/api/football?endpoint=fixtures&league=${league}&from=${ymd(start)}&to=${ymd(end)}&timezone=Europe%2FLondon`);
    for(const f of d.response||[]) if(['NS','TBD'].includes(f?.fixture?.status?.short)) fixtures.push(f);
  }catch(e){console.warn('fixture load',league,e.message)}
  await sleep(120);
}
fixtures.sort((a,b)=>{
  const ao=/oxford united/i.test(`${a?.teams?.home?.name} ${a?.teams?.away?.name}`)?0:1,bo=/oxford united/i.test(`${b?.teams?.home?.name} ${b?.teams?.away?.name}`)?0:1;if(ao!==bo)return ao-bo;
  const ar=englishRank.get(a?.league?.id)||100,br=englishRank.get(b?.league?.id)||100;if(ar!==br)return ar-br;
  return new Date(a.fixture.date)-new Date(b.fixture.date);
});
const selected=fixtures.slice(0,maxFixtures);
console.log(`Processing ${selected.length}/${fixtures.length} fixtures`);
let reserveHit=false;
for(const stage of ['scout','deep']){
 for(let i=0;i<selected.length;i++){
  if(reserveHit)break;
  const f=selected[i];
  try{
    const pred=await post('/api/predict',{fixtureId:f.fixture.id,homeTeam:f.teams.home.name,awayTeam:f.teams.away.name,homeTeamId:f.teams.home.id,awayTeamId:f.teams.away.id,competition:f.league.name,fixtureDate:f.fixture.date,leagueId:f.league.id,season:f.league.season,mode:stage});
    const payload={ts:Date.now(),model:pred.model,stage:pred.analysisStage||stage,lineupConfirmed:!!pred.lineupConfirmed,lineupChecked:!!pred.lineupChecked,hasIntervening:!!pred.hasIntervening,interveningUntil:pred.interveningUntil||null,evidence:pred.evidence||{},dataLayers:pred.dataLayers||null,lineups:pred.lineups||null,predictions:(pred.predictions||[]).map(p=>({...p,fixtureId:String(f.fixture.id),fixture:`${f.teams.home.name} v ${f.teams.away.name}`,competition:f.league.name,kickoff:f.fixture.date,model:pred.model}))};
    if(Number.isFinite(pred?.quota?.daily)&&pred.quota.daily<=2000){console.warn('Protected API reserve reached:',pred.quota.daily);reserveHit=true;}
    await post('/api/state',{action:'upsertPrediction',fixtureId:String(f.fixture.id),payload,predictionTs:new Date().toISOString(),dataCutoffTs:new Date().toISOString(),featureVersion:'v16-feature-1',calibrationVersion:'v16-cal-1',cycleId:`${ymd(start)}-${stage}`});
    console.log(stage,i+1,`${f.teams.home.name} v ${f.teams.away.name}`);
  }catch(e){console.warn(stage,`${f?.teams?.home?.name} v ${f?.teams?.away?.name}`,e.message)}
  await sleep(250);
 }
 if(reserveHit)break;
}
await post('/api/state',{action:'setState',key:'last_worker_status',payload:{status:'complete',completedAt:new Date().toISOString(),fixtures:selected.length,stages:['initial','deep'],source:'github-actions'}}).catch(()=>{});
