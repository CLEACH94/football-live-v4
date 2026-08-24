const API = "https://v3.football.api-sports.io";
const MODEL_VERSION = "v14-match-intelligence-ensemble";

const LEAGUES = {
  39:{score:1.00,label:"Premier League"},40:{score:.90,label:"Championship"},
  41:{score:.82,label:"League One"},42:{score:.76,label:"League Two"},
  45:{score:.82,label:"FA Cup"},48:{score:.82,label:"League Cup"},
  2:{score:1.00,label:"Champions League"},3:{score:.94,label:"Europa League"},
  848:{score:.88,label:"Conference League"},179:{score:.78,label:"Scottish Premiership"},
  140:{score:.96,label:"La Liga"},78:{score:.96,label:"Bundesliga"},
  135:{score:.95,label:"Serie A"},61:{score:.93,label:"Ligue 1"},
  88:{score:.86,label:"Eredivisie"},94:{score:.86,label:"Primeira Liga"},
  144:{score:.82,label:"Belgian Pro League"},203:{score:.82,label:"Turkish Super Lig"},
  197:{score:.76,label:"Greek Super League"},207:{score:.78,label:"Swiss Super League"},
  218:{score:.78,label:"Austrian Bundesliga"},119:{score:.79,label:"Danish Superliga"},
  103:{score:.78,label:"Norwegian Eliteserien"},113:{score:.78,label:"Swedish Allsvenskan"},
  253:{score:.82,label:"MLS"},71:{score:.84,label:"Brazil Serie A"},128:{score:.82,label:"Argentina Primera"}
};

const cache = new Map();
const wait = ms => new Promise(r=>setTimeout(r,ms));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const num=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const rows=d=>Array.isArray(d?.response)?d.response:[];

async function api(path,key,ttl=0){
  if(ttl&&cache.has(path)&&Date.now()-cache.get(path).time<ttl)return cache.get(path).data;
  const r=await fetch(API+path,{headers:{"x-apisports-key":key}});
  const d=await r.json();
  if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);
  if(d?.errors&&(Array.isArray(d.errors)?d.errors.length:Object.keys(d.errors).length)){
    throw new Error(Array.isArray(d.errors)?d.errors.join(", "):JSON.stringify(d.errors));
  }
  if(ttl)cache.set(path,{time:Date.now(),data:d});
  return d;
}
async function mapLimit(items,limit,fn){
  const out=[];let i=0;
  async function worker(){
    while(i<items.length){
      const idx=i++;
      try{out[idx]=await fn(items[idx],idx)}catch{out[idx]=null}
      await wait(70);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}
function seasonFor(date){const d=new Date(date),y=d.getUTCFullYear();return d.getUTCMonth()+1>=7?y:y-1}
function done(f){return ["FT","AET","PEN"].includes(f?.fixture?.status?.short||"")}
function teamSide(f,id){return f?.teams?.home?.id===id?"home":f?.teams?.away?.id===id?"away":null}
function opponentId(f,id){return f?.teams?.home?.id===id?f?.teams?.away?.id:f?.teams?.away?.id===id?f?.teams?.home?.id:null}
function gfga(f,id){const side=teamSide(f,id),h=num(f?.goals?.home),a=num(f?.goals?.away);if(!side||h===null||a===null)return null;return side==="home"?[h,a]:[a,h]}
function recent(all,id,before,limit=20,side=null){return all.filter(done).filter(f=>new Date(f.fixture.date)<before).filter(f=>teamSide(f,id)).filter(f=>!side||teamSide(f,id)===side).sort((a,b)=>new Date(b.fixture.date)-new Date(a.fixture.date)).slice(0,limit)}
function daysBetween(a,b){return Math.max(0,(new Date(b)-new Date(a))/86400000)}
function lastMatchRest(list,target){return list.length?+daysBetween(list[0].fixture.date,target).toFixed(1):null}
function congestion(list,target,days=14){const cut=new Date(target).getTime()-days*86400000;return list.filter(f=>new Date(f.fixture.date).getTime()>=cut).length}
function interveningFixtures(data,targetFixtureId,targetDate){const now=Date.now(),target=new Date(targetDate).getTime();return rows(data).filter(f=>f?.fixture?.id!==targetFixtureId).filter(f=>{const t=new Date(f?.fixture?.date||0).getTime(),s=f?.fixture?.status?.short||"";return t>now&&t<target&&["NS","TBD"].includes(s)}).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date))}
function weightedAvg(list,id,index,decay=.90){let n=0,d=0;list.forEach((f,i)=>{const x=gfga(f,id);if(!x)return;const w=Math.pow(decay,i);n+=x[index]*w;d+=w});return d?n/d:null}
function ppg(list,id){let n=0,d=0;list.forEach((f,i)=>{const x=gfga(f,id);if(!x)return;const pts=x[0]>x[1]?3:x[0]===x[1]?1:0,w=Math.pow(.92,i);n+=pts*w;d+=w});return d?n/d:1.35}
function form(list,id){return list.slice(0,5).map(f=>{const x=gfga(f,id);return !x?"D":x[0]>x[1]?"W":x[0]<x[1]?"L":"D"})}
function hitRate(list,rule,id){let h=0,n=0;for(const f of list.slice(0,10)){const x=gfga(f,id);if(!x)continue;n++;const gf=x[0],ga=x[1],t=gf+ga;if(rule==="team05"&&gf>=1)h++;if(rule==="over15"&&t>=2)h++;if(rule==="over25"&&t>=3)h++;if(rule==="under35"&&t<=3)h++;if(rule==="under45"&&t<=4)h++;if(rule==="btts"&&gf>0&&ga>0)h++;if(rule==="nonloss"&&gf>=ga)h++;if(rule==="win"&&gf>ga)h++;if(rule==="draw"&&gf===ga)h++}return n?Math.round(100*h/n):0}
function shrink(obs,n,base,strength=8){if(!Number.isFinite(obs))return base;const w=n/(n+strength);return obs*w+base*(1-w)}
function seasonStat(d,path,f=null){let x=d?.response;for(const p of path)x=x?.[p];return num(x,f)}
function standing(d,id){const flat=(d?.response?.[0]?.league?.standings||[]).flat(),r=flat.find(x=>x?.team?.id===id);return r?{pos:num(r.rank),total:flat.length,gd:num(r.goalsDiff,0),points:num(r.points,0)}:null}
function standingMap(d){const flat=(d?.response?.[0]?.league?.standings||[]).flat(),m=new Map();flat.forEach(r=>{if(r?.team?.id)m.set(r.team.id,{pos:num(r.rank),total:flat.length,gd:num(r.goalsDiff,0),points:num(r.points,0)})});return m}
function opponentAdjustedAvg(list,id,index,smap,decay=.91){let n=0,d=0;list.forEach((f,i)=>{const x=gfga(f,id),opp=smap.get(opponentId(f,id));if(!x)return;let mult=1;if(opp&&opp.total>1){const strength=1-(opp.pos-1)/(opp.total-1);mult=index===0?.94+strength*.12:1.06-strength*.12}const w=Math.pow(decay,i);n+=x[index]*mult*w;d+=w});return d?n/d:null}
function factorial(n){let r=1;for(let i=2;i<=n;i++)r*=i;return r}
function pois(k,l){return Math.exp(-l)*Math.pow(l,k)/factorial(k)}
function dixonColesMatrix(lh,la,rho=-.075){let home=0,draw=0,away=0,total=0;for(let h=0;h<=9;h++)for(let a=0;a<=9;a++){let tau=1;if(h===0&&a===0)tau=1-lh*la*rho;if(h===0&&a===1)tau=1+lh*rho;if(h===1&&a===0)tau=1+la*rho;if(h===1&&a===1)tau=1-rho;const p=Math.max(0,pois(h,lh)*pois(a,la)*tau);total+=p;if(h>a)home+=p;else if(h===a)draw+=p;else away+=p}return{home:home/total,draw:draw/total,away:away/total}}
function goalProbs(lh,la){const t=lh+la,e=Math.exp(-t);return{over15:1-e*(1+t),over25:1-e*(1+t+t*t/2),under35:e*(1+t+t*t/2+t*t*t/6),under45:e*(1+t+t*t/2+t*t*t/6+t**4/24)}}
function probabilitySet(lh,la){const m=dixonColesMatrix(lh,la),g=goalProbs(lh,la),h05=1-Math.exp(-lh),a05=1-Math.exp(-la);return{"home0.5":h05,"away0.5":a05,"over1.5":g.over15,"over2.5":g.over25,"under3.5":g.under35,"under4.5":g.under45,btts:h05*a05,homeOrDraw:m.home+m.draw,awayOrDraw:m.away+m.draw,homeWin:m.home,draw:m.draw,awayWin:m.away}}
function statValue(teamStats,type){const item=(teamStats||[]).find(x=>String(x?.type||"").toLowerCase()===type.toLowerCase()),v=item?.value;if(typeof v==="string"&&v.endsWith("%"))return num(v.slice(0,-1));return num(v)}
function chanceProfiles(statResponses,teamId){let own={sot:0,shots:0,corners:0,poss:0,n:0},opp={sot:0,shots:0,corners:0,poss:0,n:0};for(const d of statResponses.filter(Boolean)){const mine=d?.response?.find(x=>x?.team?.id===teamId),other=d?.response?.find(x=>x?.team?.id!==teamId);if(!mine||!other)continue;for(const [box,row] of [[own,mine],[opp,other]]){const s=row.statistics||[],a=statValue(s,"Shots on Goal"),b=statValue(s,"Total Shots"),c=statValue(s,"Corner Kicks"),p=statValue(s,"Ball Possession");if(a===null&&b===null)continue;box.sot+=a||0;box.shots+=b||0;box.corners+=c||0;box.poss+=p||50;box.n++}}
 const fin=box=>{if(!box.n)return null;const sot=box.sot/box.n,shots=box.shots/box.n,corners=box.corners/box.n,poss=box.poss/box.n,pressure=clamp(.45*sot+.075*shots+.055*corners+.012*(poss-50),0,5);return{sot:+sot.toFixed(1),shots:+shots.toFixed(1),corners:+corners.toFixed(1),poss:+poss.toFixed(1),pressure:+pressure.toFixed(2),sample:box.n}};
 return{for:fin(own),against:fin(opp)}
}
function timingProfile(d,side){const m=d?.response?.goals?.[side]?.minute||{};let early=0,late=0,total=0;Object.entries(m).forEach(([k,v])=>{const n=num(v?.total,0);total+=n;if(["0-15","16-30"].includes(k))early+=n;if(["76-90","91-105","106-120"].includes(k))late+=n});return total?{early:early/total,late:late/total,total}:null}
function lineupInfo(d){const ls=rows(d);if(ls.length<2)return{confirmed:false,lineups:[]};const good=ls.filter(x=>Array.isArray(x?.startXI)&&x.startXI.length>=11);return{confirmed:good.length>=2,lineups:good}}
function lineupFor(info,teamId){return info.lineups.find(x=>x?.team?.id===teamId)||null}
function xiPlayers(lineup){return(lineup?.startXI||[]).map(x=>({id:x?.player?.id,name:x?.player?.name,pos:String(x?.player?.pos||x?.player?.position||"").toUpperCase()})).filter(x=>x.id)}
function xiIds(lineup){return xiPlayers(lineup).map(x=>x.id)}
function playerMap(playerData){const m=new Map();for(const r of playerData.flatMap(rows)){const id=r?.player?.id;if(!id)continue;const stats=(r.statistics||[])[0]||{};m.set(id,{rating:num(stats?.games?.rating,6.5),minutes:num(stats?.games?.minutes,0),goals:num(stats?.goals?.total,0),assists:num(stats?.goals?.assists,0),shots:num(stats?.shots?.on,0),passes:num(stats?.passes?.key,0),tackles:num(stats?.tackles?.total,0),interceptions:num(stats?.tackles?.interceptions,0),position:String(r?.player?.position||stats?.games?.position||"").toUpperCase()})}return m}
function xiStrength(players,map){if(!players.length)return null;const vals=players.map(p=>({p,...map.get(p.id)})).filter(x=>Number.isFinite(x.rating));if(vals.length<6)return null;const rating=vals.reduce((a,x)=>a+x.rating,0)/vals.length,attack=vals.reduce((a,x)=>a+x.goals*1+x.assists*.7+x.shots*.10+x.passes*.05,0)/vals.length,defence=vals.reduce((a,x)=>a+x.tackles*.06+x.interceptions*.10,0)/vals.length;
 const groups={gk:[],defence:[],midfield:[],attack:[]};vals.forEach(x=>{const pos=(x.p.pos||x.position||"").toUpperCase();if(pos.startsWith("G"))groups.gk.push(x);else if(pos.startsWith("D"))groups.defence.push(x);else if(pos.startsWith("M"))groups.midfield.push(x);else groups.attack.push(x)});const unit=arr=>arr.length?+(arr.reduce((a,x)=>a+x.rating,0)/arr.length).toFixed(2):null;return{rating:+rating.toFixed(2),attack:+attack.toFixed(2),defence:+defence.toFixed(2),covered:vals.length,units:{gk:unit(groups.gk),defence:unit(groups.defence),midfield:unit(groups.midfield),attack:unit(groups.attack)}}}
function pairContinuity(currentIds,historicalIds){if(currentIds.length<8||!historicalIds.length)return null;let pairTotal=0,pairHits=0;for(let i=0;i<currentIds.length;i++)for(let j=i+1;j<currentIds.length;j++){pairTotal++;const a=currentIds[i],b=currentIds[j];pairHits+=historicalIds.filter(x=>x.includes(a)&&x.includes(b)).length/historicalIds.length}return pairTotal?pairHits/pairTotal:null}
function formationContinuity(lineup,historical){const current=String(lineup?.formation||"");if(!current||!historical.length)return null;const hits=historical.filter(x=>String(x?.formation||"")===current).length;return hits/historical.length}
function confidenceCalibrate(p,q){const reliability=.52+.43*(q/100);return clamp(.5+(p-.5)*reliability,.04,.96)}
function dataQuality(o){let q=o.stage==="scout"?39:45;q+=Math.min(14,(o.homeN+o.awayN)*.45);q+=Math.min(8,(o.homeSplitN+o.awaySplitN)*.55);if(o.season)q+=6;if(o.table)q+=4;if(o.chance)q+=8;if(o.injuries)q+=2;if(o.external)q+=3;if(o.lineupConfirmed)q+=8;if(o.playerStrength)q+=5;if(o.partnership)q+=3;if(o.formation)q+=2;if(o.timing)q+=2;q+=o.leagueScore*3;return Math.round(clamp(q,48,99))}
async function squadPages(team,league,season,key){const first=await api(`/players?team=${team}&league=${league}&season=${season}&page=1`,key,600000).catch(()=>null);if(!first)return[];const out=[first],total=num(first?.paging?.total,1);if(total>1)out.push(await api(`/players?team=${team}&league=${league}&season=${season}&page=2`,key,600000).catch(()=>null));return out.filter(Boolean)}
function externalProb(d){const p=d?.response?.[0]?.predictions?.percent||{};const pct=v=>{if(typeof v==="string")return num(v.replace("%",""),null);return num(v,null)};const h=pct(p.home),dr=pct(p.draw),a=pct(p.away);if(h===null||dr===null||a===null)return null;const total=h+dr+a||100;return{homeWin:h/total,draw:dr/total,awayWin:a/total,homeOrDraw:(h+dr)/total,awayOrDraw:(a+dr)/total}}
function engineAgreement(values){const xs=values.filter(Number.isFinite);if(xs.length<2)return{score:70,spread:null,count:xs.length};const mean=xs.reduce((a,x)=>a+x,0)/xs.length,variance=xs.reduce((a,x)=>a+(x-mean)**2,0)/xs.length,sd=Math.sqrt(variance);return{score:Math.round(clamp(100-sd*240,45,99)),spread:+(sd*100).toFixed(1),count:xs.length}}
function plainReasons({rule,p,q,agreement,hChance,aChance,homeRest,awayRest,linfo,hasIntervening,homeTeam,awayTeam,finalLH,finalLA}){const out=[];const total=finalLH+finalLA;if(rule==="under4.5"||rule==="under3.5")out.push(`The match profile points to about ${total.toFixed(1)} total goals, comfortably below this line.`);else if(rule==="over1.5"||rule==="over2.5"||rule==="btts")out.push(`The attacking profile points to about ${total.toFixed(1)} total goals.`);else if(rule==="home0.5")out.push(`${homeTeam}'s attacking numbers give them a strong chance of scoring at least once.`);else if(rule==="away0.5")out.push(`${awayTeam}'s attacking numbers give them a strong chance of scoring at least once.`);else out.push(`Recent strength and home/away performance support this result outcome.`);
 if(hChance?.for&&aChance?.for)out.push(`Recent shot and chance pressure supports the forecast rather than relying on goals alone.`);if(agreement>=85)out.push(`The independent model checks broadly agree with each other.`);else if(agreement<70)out.push(`Some model checks disagree, so the displayed percentage has been held back.`);if(homeRest!==null&&awayRest!==null&&Math.abs(homeRest-awayRest)<2.5)out.push(`Neither side has a major recovery-time advantage.`);return out.slice(0,3)}
function watchItems({linfo,hasIntervening,hBefore,aBefore,agreement}){const out=[];if(!linfo.confirmed)out.push("Starting line-ups are not confirmed yet, so the forecast can still move.");if(hasIntervening)out.push(`A team plays before this fixture, so this analysis will be rebuilt afterwards.`);if(agreement<70)out.push("The model engines disagree more than usual.");return out.slice(0,2)}

module.exports=async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const key=process.env.API_FOOTBALL_KEY;if(!key)return res.status(500).json({error:"API_FOOTBALL_KEY missing"});
  const b=req.body||{},homeId=num(b.homeTeamId),awayId=num(b.awayTeamId),leagueId=num(b.leagueId),fixtureId=num(b.fixtureId),mode=b.mode==="scout"?"scout":"deep";
  const before=new Date(b.fixtureDate||Date.now()),season=num(b.season,seasonFor(before));
  if(!homeId||!awayId||!fixtureId)return res.status(400).json({error:"Missing fixture/team IDs"});
  try{
    const targetDay=before.toISOString().slice(0,10),todayDay=new Date().toISOString().slice(0,10);
    const [homeD,awayD,homeUpcomingD,awayUpcomingD]=await Promise.all([
      api(`/fixtures?team=${homeId}&last=20`,key,180000),api(`/fixtures?team=${awayId}&last=20`,key,180000),
      api(`/fixtures?team=${homeId}&from=${todayDay}&to=${targetDay}`,key,180000).catch(()=>null),api(`/fixtures?team=${awayId}&from=${todayDay}&to=${targetDay}`,key,180000).catch(()=>null)
    ]);
    const h20=recent(rows(homeD),homeId,before,20),a20=recent(rows(awayD),awayId,before,20),hHome=recent(rows(homeD),homeId,before,10,"home"),aAway=recent(rows(awayD),awayId,before,10,"away");
    if(h20.length<5||a20.length<5)return res.status(422).json({error:"Not enough recent completed matches"});
    const hBefore=interveningFixtures(homeUpcomingD,fixtureId,before),aBefore=interveningFixtures(awayUpcomingD,fixtureId,before),homeRest=lastMatchRest(h20,before),awayRest=lastMatchRest(a20,before),homeCongestion=congestion(h20,before,14),awayCongestion=congestion(a20,before,14),hasIntervening=!!(hBefore.length||aBefore.length),interveningUntil=[...hBefore,...aBefore].length?Math.max(...[...hBefore,...aBefore].map(f=>new Date(f.fixture.date).getTime())):null;
    const date=before.toISOString().slice(0,10);
    const [hs,as,stand]=await Promise.all([
      leagueId?api(`/teams/statistics?league=${leagueId}&season=${season}&team=${homeId}&date=${date}`,key,600000).catch(()=>null):null,
      leagueId?api(`/teams/statistics?league=${leagueId}&season=${season}&team=${awayId}&date=${date}`,key,600000).catch(()=>null):null,
      leagueId?api(`/standings?league=${leagueId}&season=${season}`,key,600000).catch(()=>null):null
    ]);
    let inj=null,lineupD=null,h2hD=null,externalD=null,statResponses=[];
    if(mode==="deep"){
      [inj,lineupD,h2hD,externalD]=await Promise.all([
        api(`/injuries?fixture=${fixtureId}`,key,180000).catch(()=>null),api(`/fixtures/lineups?fixture=${fixtureId}`,key,120000).catch(()=>null),
        api(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`,key,600000).catch(()=>null),api(`/predictions?fixture=${fixtureId}`,key,300000).catch(()=>null)
      ]);
      const statIds=[...new Set([...h20.slice(0,6),...a20.slice(0,6)].map(x=>x.fixture.id))];
      statResponses=await mapLimit(statIds,4,id=>api(`/fixtures/statistics?fixture=${id}`,key,600000));
    }
    const smap=standingMap(stand),hSt=standing(stand,homeId),aSt=standing(stand,awayId),league=LEAGUES[leagueId]||{score:.8,label:b.competition||"Competition"};
    const baselineVals=[seasonStat(hs,["goals","for","average","total"],null),seasonStat(as,["goals","for","average","total"],null)].filter(Number.isFinite),baseline=clamp(baselineVals.length?baselineVals.reduce((a,x)=>a+x,0)/baselineVals.length:1.35,.95,1.85);
    const hGF=opponentAdjustedAvg(hHome,homeId,0,smap)??weightedAvg(hHome,homeId,0)??baseline,hGA=opponentAdjustedAvg(hHome,homeId,1,smap)??weightedAvg(hHome,homeId,1)??baseline,aGF=opponentAdjustedAvg(aAway,awayId,0,smap)??weightedAvg(aAway,awayId,0)??baseline,aGA=opponentAdjustedAvg(aAway,awayId,1,smap)??weightedAvg(aAway,awayId,1)??baseline;
    const hPlayed=seasonStat(hs,["fixtures","played","home"],0),aPlayed=seasonStat(as,["fixtures","played","away"],0),hsGF=seasonStat(hs,["goals","for","average","home"],null),hsGA=seasonStat(hs,["goals","against","average","home"],null),asGF=seasonStat(as,["goals","for","average","away"],null),asGA=seasonStat(as,["goals","against","average","away"],null);
    let baseLH=.50*shrink(hGF,hHome.length,baseline,7)+.22*shrink(hsGF,hPlayed,baseline,10)+.28*shrink(asGA,aPlayed,baseline,10),baseLA=.50*shrink(aGF,aAway.length,baseline,7)+.22*shrink(asGF,aPlayed,baseline,10)+.28*shrink(hsGA,hPlayed,baseline,10);
    const dppg=ppg(h20,homeId)-ppg(a20,awayId);let strengthLH=baseLH*clamp(1+dppg*.052,.88,1.13),strengthLA=baseLA*clamp(1-dppg*.047,.89,1.12);
    if(hSt&&aSt&&hSt.total>1){const delta=(aSt.pos-hSt.pos)/(hSt.total-1),sample=Math.min(hPlayed+aPlayed,20)/20;strengthLH*=1+delta*.09*sample;strengthLA*=1-delta*.07*sample}
    let scheduleLH=strengthLH,scheduleLA=strengthLA;if(homeRest!==null&&awayRest!==null){const rd=clamp((homeRest-awayRest)/5,-1,1);scheduleLH*=1+rd*.025;scheduleLA*=1-rd*.020}const cd=clamp(homeCongestion-awayCongestion,-3,3);scheduleLH*=1-cd*.008;scheduleLA*=1+cd*.007;
    const hChance=mode==="deep"?chanceProfiles(statResponses,homeId):{for:null,against:null},aChance=mode==="deep"?chanceProfiles(statResponses,awayId):{for:null,against:null};
    let chanceLH=scheduleLH,chanceLA=scheduleLA;if(hChance.for&&aChance.against&&aChance.for&&hChance.against){const hCreate=(hChance.for.pressure+aChance.against.pressure)/2,aCreate=(aChance.for.pressure+hChance.against.pressure)/2;chanceLH=clamp(.62*scheduleLH+.38*(baseline*(.72+hCreate/5)),.15,3.8);chanceLA=clamp(.62*scheduleLA+.38*(baseline*(.72+aCreate/5)),.13,3.6)}
    const injuries=rows(inj),hInj=injuries.filter(x=>x?.team?.id===homeId).length,aInj=injuries.filter(x=>x?.team?.id===awayId).length;let availLH=chanceLH,availLA=chanceLA;if(mode==="deep"){availLH*=clamp(1-(hInj-aInj)*.007,.95,1.04);availLA*=clamp(1-(aInj-hInj)*.007,.95,1.04)}
    const linfo=lineupInfo(lineupD),hLine=lineupFor(linfo,homeId),aLine=lineupFor(linfo,awayId);let hXi=null,aXi=null,hContinuity=null,aContinuity=null,hFormation=null,aFormation=null;
    if(linfo.confirmed&&leagueId){const hRecentIds=h20.slice(0,4).map(x=>x.fixture.id),aRecentIds=a20.slice(0,4).map(x=>x.fixture.id),[hp,ap,hHist,aHist]=await Promise.all([squadPages(homeId,leagueId,season,key),squadPages(awayId,leagueId,season,key),mapLimit(hRecentIds,3,id=>api(`/fixtures/lineups?fixture=${id}`,key,600000)),mapLimit(aRecentIds,3,id=>api(`/fixtures/lineups?fixture=${id}`,key,600000))]);const pmap=playerMap([...hp,...ap]),hPlayers=xiPlayers(hLine),aPlayers=xiPlayers(aLine),histLines=(arr,team)=>arr.filter(Boolean).map(d=>lineupFor(lineupInfo(d),team)).filter(Boolean),hHL=histLines(hHist,homeId),aHL=histLines(aHist,awayId);hXi=xiStrength(hPlayers,pmap);aXi=xiStrength(aPlayers,pmap);hContinuity=pairContinuity(hPlayers.map(x=>x.id),hHL.map(x=>xiIds(x)));aContinuity=pairContinuity(aPlayers.map(x=>x.id),aHL.map(x=>xiIds(x)));hFormation=formationContinuity(hLine,hHL);aFormation=formationContinuity(aLine,aHL)}
    let squadLH=availLH,squadLA=availLA;if(linfo.confirmed&&hXi&&aXi){const rd=clamp((hXi.rating-aXi.rating)/3,-.12,.12),ad=clamp((hXi.attack-aXi.attack)/8,-.10,.10);squadLH*=1+rd*.20+ad*.18;squadLA*=1-rd*.17-ad*.14;if(hContinuity!==null&&aContinuity!==null){const c=clamp(hContinuity-aContinuity,-.25,.25);squadLH*=1+c*.08;squadLA*=1-c*.06}if(hFormation!==null&&aFormation!==null){const f=clamp(hFormation-aFormation,-.5,.5);squadLH*=1+f*.018;squadLA*=1-f*.014}}
    baseLH*=1.05;baseLA*=.98;strengthLH*=1.05;strengthLA*=.98;scheduleLH*=1.05;scheduleLA*=.98;chanceLH*=1.05;chanceLA*=.98;squadLH*=1.05;squadLA*=.98;
    const h2h=rows(h2hD).filter(done).slice(0,5);if(mode==="deep"&&h2h.length>=3){let hg=0,ag=0,n=0;for(const f of h2h){const x=gfga(f,homeId);if(!x)continue;hg+=x[0];ag+=x[1];n++}if(n){squadLH=squadLH*.98+(hg/n)*.02;squadLA=squadLA*.98+(ag/n)*.02}}
    const engines=[{name:"Score",lh:baseLH,la:baseLA},{name:"Strength",lh:strengthLH,la:strengthLA},{name:"Schedule",lh:scheduleLH,la:scheduleLA}];if(mode==="deep")engines.push({name:"Chance",lh:chanceLH,la:chanceLA},{name:"Squad",lh:squadLH,la:squadLA});
    const engineSets=engines.map(e=>({name:e.name,p:probabilitySet(clamp(e.lh,.15,3.8),clamp(e.la,.13,3.6))})),external=mode==="deep"?externalProb(externalD):null;
    const avgLambda=mode==="deep"?{lh:(scheduleLH+chanceLH+squadLH)/3,la:(scheduleLA+chanceLA+squadLA)/3}:{lh:(baseLH+strengthLH+scheduleLH)/3,la:(baseLA+strengthLA+scheduleLA)/3},finalLH=clamp(avgLambda.lh,.15,3.8),finalLA=clamp(avgLambda.la,.13,3.6);
    const hTiming=timingProfile(hs,"for"),aTiming=timingProfile(as,"for");
    let q=dataQuality({stage:mode,homeN:h20.length,awayN:a20.length,homeSplitN:hHome.length,awaySplitN:aAway.length,season:!!(hs&&as),table:!!(hSt&&aSt),chance:!!(hChance.for&&aChance.for),injuries:!!inj,external:!!external,lineupConfirmed:linfo.confirmed,playerStrength:!!(hXi&&aXi),partnership:hContinuity!==null&&aContinuity!==null,formation:hFormation!==null&&aFormation!==null,timing:!!(hTiming&&aTiming),leagueScore:league.score});if(hasIntervening&&!linfo.confirmed)q=Math.max(54,q-8);
    const titles={"home0.5":`${b.homeTeam} over 0.5 goals`,"away0.5":`${b.awayTeam} over 0.5 goals`,"over1.5":"Over 1.5 match goals","over2.5":"Over 2.5 match goals","under3.5":"Under 3.5 match goals","under4.5":"Under 4.5 match goals",btts:"Both teams to score",homeOrDraw:`${b.homeTeam} or draw`,awayOrDraw:`${b.awayTeam} or draw`,homeWin:`${b.homeTeam} win`,draw:"Draw",awayWin:`${b.awayTeam} win`};
    const types={"home0.5":"teamgoal","away0.5":"teamgoal","over1.5":"goals","over2.5":"goals","under3.5":"goals","under4.5":"goals",btts:"btts",homeOrDraw:"double",awayOrDraw:"double",homeWin:"result",draw:"result",awayWin:"result"};
    const histRule={"home0.5":[h20,"team05",homeId],"away0.5":[a20,"team05",awayId],"over1.5":null,"over2.5":null,"under3.5":null,"under4.5":null,btts:null,homeOrDraw:[h20,"nonloss",homeId],awayOrDraw:[a20,"nonloss",awayId],homeWin:[h20,"win",homeId],draw:null,awayWin:[a20,"win",awayId]};
    const rules=Object.keys(titles),predictions=rules.map(rule=>{const values=engineSets.map(e=>e.p[rule]).filter(Number.isFinite);if(external&&Number.isFinite(external[rule]))values.push(external[rule]);const mean=values.reduce((a,x)=>a+x,0)/values.length,agree=engineAgreement(values),disagreementPenalty=clamp((100-agree.score)/100*.10,0,.055),raw=clamp(mean-(mean>.5?disagreementPenalty:-disagreementPenalty*.25),.03,.97),cal=confidenceCalibrate(raw,q),hr=histRule[rule]?hitRate(...histRule[rule]):rule==="draw"?Math.round((hitRate(h20,"draw",homeId)+hitRate(a20,"draw",awayId))/2):rule==="btts"?Math.round((hitRate(h20,"btts",homeId)+hitRate(a20,"btts",awayId))/2):rule==="over1.5"?Math.round((hitRate(h20,"over15",homeId)+hitRate(a20,"over15",awayId))/2):rule==="over2.5"?Math.round((hitRate(h20,"over25",homeId)+hitRate(a20,"over25",awayId))/2):rule==="under3.5"?Math.round((hitRate(h20,"under35",homeId)+hitRate(a20,"under35",awayId))/2):Math.round((hitRate(h20,"under45",homeId)+hitRate(a20,"under45",awayId))/2);const reasons=plainReasons({rule,p:cal,q,agreement:agree.score,hChance,aChance,homeRest,awayRest,linfo,hasIntervening,homeTeam:b.homeTeam,awayTeam:b.awayTeam,finalLH,finalLA}),watch=watchItems({linfo,hasIntervening,hBefore,aBefore,agreement:agree.score});return{id:`${fixtureId}|${rule}`,type:types[rule],title:titles[rule],rule,p:Math.round(cal*100),rawP:Math.round(raw*100),reasons,watch,technical:`V14 ensemble uses opponent-adjusted recent form, home/away splits, season attack/defence, Dixon–Coles score modelling, schedule/rest context${mode==="deep"?", chance creation and defensive suppression, availability and an external comparison model":""}${linfo.confirmed?", confirmed XI unit strength, formation and partnership continuity":""}.`,stats:{expectedHome:+finalLH.toFixed(2),expectedAway:+finalLA.toFixed(2),homePosition:hSt?.pos??null,awayPosition:aSt?.pos??null,dataConfidence:q,last5HitRate:hr,homeForm:form(h20,homeId),awayForm:form(a20,awayId),h2hGames:h2h.length,homeSample:h20.length,awaySample:a20.length,homeVenueSample:hHome.length,awayVenueSample:aAway.length,lineupConfirmed:linfo.confirmed,homeXI:hXi?.rating??null,awayXI:aXi?.rating??null,homeUnits:hXi?.units??null,awayUnits:aXi?.units??null,homeContinuity:hContinuity===null?null:Math.round(hContinuity*100),awayContinuity:aContinuity===null?null:Math.round(aContinuity*100),homeFormation:hLine?.formation??null,awayFormation:aLine?.formation??null,homeFormationContinuity:hFormation===null?null:Math.round(hFormation*100),awayFormationContinuity:aFormation===null?null:Math.round(aFormation*100),homeChance:hChance.for?.pressure??null,awayChance:aChance.for?.pressure??null,homeSuppression:hChance.against?.pressure??null,awaySuppression:aChance.against?.pressure??null,homeSOT:hChance.for?.sot??null,awaySOT:aChance.for?.sot??null,homeInjuries:hInj,awayInjuries:aInj,homeRestDays:homeRest,awayRestDays:awayRest,homeCongestion14:homeCongestion,awayCongestion14:awayCongestion,homePlaysBefore:hBefore.length>0,awayPlaysBefore:aBefore.length>0,interveningHome:hBefore[0]?`${hBefore[0].teams.home.name} v ${hBefore[0].teams.away.name}`:null,interveningAway:aBefore[0]?`${aBefore[0].teams.home.name} v ${aBefore[0].teams.away.name}`:null,engineAgreement:agree.score,engineSpread:agree.spread,engineCount:agree.count,externalModel:!!external,analysisStage:linfo.confirmed?"final":mode,freshness:linfo.confirmed?100:hasIntervening?62:Math.round(clamp(80+(q-70)*.4,70,96))}}}).sort((a,b)=>b.p-a.p);
    return res.status(200).json({model:MODEL_VERSION,source:"API-Football",fixtureId,analysisStage:linfo.confirmed?"final":mode,lineupConfirmed:linfo.confirmed,lineupChecked:mode==="deep",hasIntervening,interveningUntil,scheduleContext:{homeRestDays:homeRest,awayRestDays:awayRest,homeCongestion14:homeCongestion,awayCongestion14:awayCongestion,homePlaysBefore:hBefore.length>0,awayPlaysBefore:aBefore.length>0},evidence:{opponentAdjusted:true,chanceStats:!!(hChance.for&&aChance.for),defensiveSuppression:!!(hChance.against&&aChance.against),externalModel:!!external,playerStrength:!!(hXi&&aXi),partnerships:hContinuity!==null&&aContinuity!==null,formation:hFormation!==null&&aFormation!==null,timing:!!(hTiming&&aTiming),scheduleContext:true},predictions});
  }catch(e){return res.status(502).json({error:"Prediction model failed",detail:e?.message||String(e)})}
};
