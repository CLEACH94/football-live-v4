const db=require('./_db');
const {cachedApiFootball}=require('./_cache');
const rows=d=>Array.isArray(d?.response)?d.response:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function seasonFor(){const d=new Date();return d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1}
function gridParts(g){const m=String(g||'').match(/(\d+):(\d+)/);return m?[Number(m[1]),Number(m[2])]:[0,0]}
function tacticalRoles(xi,formation){
  const players=(xi||[]).map(p=>({...p})),rowsMap=new Map();
  for(const p of players){const [r,c]=gridParts(p.grid);if(!r)continue;if(!rowsMap.has(r))rowsMap.set(r,[]);rowsMap.get(r).push({...p,_r:r,_c:c})}
  const rowNums=[...rowsMap.keys()].sort((a,b)=>a-b),last=rowNums.at(-1)||1;
  const labels=new Map();
  for(const r of rowNums){
    const arr=rowsMap.get(r).sort((a,b)=>a._c-b._c),n=arr.length;
    let names=[];
    if(r===1) names=['Goalkeeper'];
    else if(r===2){
      if(n===3)names=['Left centre-back','Centre-back','Right centre-back'];
      else if(n===4)names=['Left back','Left centre-back','Right centre-back','Right back'];
      else if(n===5)names=['Left wing-back','Left centre-back','Centre-back','Right centre-back','Right wing-back'];
    }else if(r===last){
      if(n===1)names=['Centre forward'];
      else if(n===2)names=['Left striker','Right striker'];
      else if(n===3)names=['Left forward','Centre forward','Right forward'];
    }else if(n===1){
      names=[r===last-1?'No. 10 / attacking midfield':'Holding midfielder'];
    }else if(n===2){
      names=(last-r>=2)?['Left pivot','Right pivot']:['Left central midfield','Right central midfield'];
    }else if(n===3){
      // In a 4-2-3-1 the three directly behind the striker are wide 10s + No.10.
      names=(r===last-1&&rowsMap.get(last)?.length===1)?['Left winger / wide 10','No. 10 / attacking midfield','Right winger / wide 10']:['Left central midfield','Central midfield','Right central midfield'];
    }else if(n===4)names=['Left midfield','Left central midfield','Right central midfield','Right midfield'];
    else if(n===5)names=['Left midfield','Left central midfield','Holding midfield','Right central midfield','Right midfield'];
    arr.forEach((p,i)=>labels.set(Number(p.id)||p.name,names[i]||(/G/i.test(p.pos||'')?'Goalkeeper':/D/i.test(p.pos||'')?'Defender':/M/i.test(p.pos||'')?'Midfielder':'Forward')));
  }
  return players.map(p=>({...p,role:labels.get(Number(p.id)||p.name)||(/G/i.test(p.pos||'')?'Goalkeeper':/D/i.test(p.pos||'')?'Defender':/M/i.test(p.pos||'')?'Midfielder':'Forward')}));
}
function playerScore(starts,stats){const rating=num(stats?.games?.rating,6.45),mins=num(stats?.games?.minutes),apps=num(stats?.games?.appearences);return clamp(50+(rating-6)*18+Math.min(12,starts*1.8)+Math.log10(mins+10)*4+Math.min(6,apps*.18),45,98)}
async function getOxfordTeam(key){const dbt=await db.select('mi_priority_teams',`name=ilike.${encodeURIComponent('Oxford United')}&select=*&limit=1`).catch(()=>[]);if(dbt?.[0])return dbt[0];const d=await cachedApiFootball('/teams?search=Oxford%20United',key,{ttlMs:2592000000,reason:'oxford:team',critical:false});const x=rows(d).find(r=>String(r?.team?.name||'').toLowerCase()==='oxford united')||rows(d)[0];if(!x?.team?.id)throw new Error('Oxford United team not found');return{team_id:x.team.id,name:x.team.name,logo:x.team.logo||null,source:'API-Football'}}
async function pagesForPlayers(teamId,season,key){const first=await cachedApiFootball(`/players?team=${teamId}&league=41&season=${season}&page=1`,key,{ttlMs:21600000,reason:'oxford:players',critical:false}).catch(()=>null);if(!first)return[];const out=[first],total=num(first?.paging?.total,1);if(total>1)out.push(await cachedApiFootball(`/players?team=${teamId}&league=41&season=${season}&page=2`,key,{ttlMs:21600000,reason:'oxford:players',critical:false}).catch(()=>null));return out.filter(Boolean)}
function extractOxfordLineup(d,teamId,fixture){const l=rows(d).find(x=>Number(x?.team?.id)===Number(teamId));if(!l||!Array.isArray(l.startXI)||l.startXI.length<11)return null;const raw=l.startXI.map(x=>({id:x.player?.id,name:x.player?.name,pos:x.player?.pos||'',grid:x.player?.grid||''}));return{fixtureId:fixture?.fixture?.id||null,date:fixture?.fixture?.date||null,opponent:fixture?.teams?.home?.id===teamId?fixture?.teams?.away?.name:fixture?.teams?.home?.name,formation:l.formation||null,coach:l.coach?.name||null,xi:tacticalRoles(raw,l.formation||''),bench:(l.substitutes||[]).map(x=>({id:x.player?.id,name:x.player?.name,pos:x.player?.pos||''}))}}
function mostUsedFormation(lineups){const m=new Map();for(const l of lineups)if(l?.formation)m.set(l.formation,(m.get(l.formation)||0)+1);return[...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||lineups[0]?.formation||'4-2-3-1'}
function buildBestXI(lineups,playerPages,formation){const statsMap=new Map(),photoMap=new Map();for(const d of playerPages)for(const r of rows(d)){const st=(r.statistics||[]).find(s=>Number(s?.league?.id)===41)||(r.statistics||[])[0]||{};if(r?.player?.id){statsMap.set(Number(r.player.id),st);photoMap.set(Number(r.player.id),r.player.photo||null)}}const usage=new Map(),slots=new Map();for(const l of lineups){for(const p of l.xi){const id=Number(p.id);if(!id)continue;const u=usage.get(id)||{id,name:p.name,starts:0,grids:new Map(),poss:new Map()};u.starts++;u.grids.set(p.grid,(u.grids.get(p.grid)||0)+1);u.poss.set(p.pos,(u.poss.get(p.pos)||0)+1);usage.set(id,u);if(l.formation===formation&&p.grid){const arr=slots.get(p.grid)||[];arr.push(id);slots.set(p.grid,arr)}}}let template=lineups.find(l=>l.formation===formation)||lineups[0];if(!template)return[];const all=[...usage.values()].map(u=>{const stats=statsMap.get(u.id)||{};const grid=[...u.grids.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';const pos=[...u.poss.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';return{...u,grid,pos,stats,score:playerScore(u.starts,stats),photo:photoMap.get(u.id)||null}}).sort((a,b)=>b.score-a.score),used=new Set(),out=[];for(const slot of template.xi){let candidates=all.filter(p=>!used.has(p.id)&&p.grids.has(slot.grid));if(!candidates.length){const [sr]=gridParts(slot.grid);candidates=all.filter(p=>!used.has(p.id)&&gridParts(p.grid)[0]===sr)}if(!candidates.length)candidates=all.filter(p=>!used.has(p.id)&&p.pos===slot.pos);const pick=candidates[0]||all.find(p=>!used.has(p.id));if(!pick)continue;used.add(pick.id);out.push({id:pick.id,name:pick.name,photo:pick.photo,grid:slot.grid||pick.grid,pos:pick.pos,role:'',rating:+pick.score.toFixed(1),starts:pick.starts,minutes:num(pick.stats?.games?.minutes),seasonRating:num(pick.stats?.games?.rating,null)})}return tacticalRoles(out,formation)}
module.exports=async function handler(req,res){try{const key=process.env.API_FOOTBALL_KEY;if(!key)return res.status(500).json({error:'API_FOOTBALL_KEY missing'});const season=seasonFor(),team=await getOxfordTeam(key),teamId=Number(team.team_id);const fx=await cachedApiFootball(`/fixtures?team=${teamId}&last=8`,key,{ttlMs:21600000,reason:'oxford:recent-fixtures',critical:false});const fixtures=rows(fx).filter(x=>['FT','AET','PEN'].includes(x?.fixture?.status?.short));const lineups=[];for(const f of fixtures.slice(0,6)){const d=await cachedApiFootball(`/fixtures/lineups?fixture=${f.fixture.id}`,key,{ttlMs:86400000,reason:'oxford:recent-lineup',critical:false}).catch(()=>null);const l=d&&extractOxfordLineup(d,teamId,f);if(l)lineups.push(l)}const formation=mostUsedFormation(lineups),players=await pagesForPlayers(teamId,season,key),bestXI=buildBestXI(lineups,players,formation),latestXI=lineups[0]||null;
const upcoming=await db.select('mi_fixtures',`or=(home_team_id.eq.${teamId},away_team_id.eq.${teamId})&kickoff=gte.${encodeURIComponent(new Date().toISOString())}&select=*&order=kickoff.asc&limit=1`).catch(()=>[]);let confirmedXI=null;if(upcoming?.[0]){const lr=await db.select('mi_lineups',`fixture_id=eq.${upcoming[0].fixture_id}&confirmed=eq.true&select=payload&limit=1`).catch(()=>[]);if(lr?.[0])confirmedXI=extractOxfordLineup(lr[0].payload,teamId,upcoming[0].payload)}const payload={team:{id:teamId,name:'Oxford United',logo:team.logo||null,competition:'League One',season:'2026/27'},coach:latestXI?.coach||'Aaron Ramsey',baseFormation:formation,recentShapes:lineups.map(l=>({date:l.date,opponent:l.opponent,formation:l.formation})),bestXI,latestXI,confirmedXI,identity:{series:'Inspires Series',home:'Art Inspires',away:'Performance Inspires',third:'Culture Inspires',cityReferences:['Cowley Road','Carfax','Oxford Stone','Our Oxford'],footballIdentity:'Possession-led, attacking intent under Aaron Ramsey'},generatedAt:new Date().toISOString()};res.setHeader('Cache-Control','s-maxage=1800, stale-while-revalidate=21600');return res.status(200).json(payload)}catch(e){return res.status(502).json({error:'Oxford intelligence unavailable',detail:e.message||String(e)})}}
