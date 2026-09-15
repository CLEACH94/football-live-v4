const BASE='https://v3.football.api-sports.io';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rows=d=>Array.isArray(d?.response)?d.response:[];
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
async function api(path,key){const r=await fetch(BASE+path,{headers:{'x-apisports-key':key}});const d=await r.json();if(!r.ok)throw new Error(`API ${r.status}`);return d}
function seasonFor(){const d=new Date();return d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1}
function role(pos){const p=String(pos||'').toLowerCase();if(p.includes('goal'))return'GK';if(p.includes('def'))return'DEF';if(p.includes('mid'))return'MID';return'ATT'}
function rate(st){const g=st.games||{},rating=num(g.rating,6.4),mins=num(g.minutes),goals=num(st.goals?.total),assists=num(st.goals?.assists),apps=num(g.appearences);return Math.round(clamp(48+(rating-6)*13+Math.log10(mins+10)*3+Math.min(8,goals*.7+assists*.5)+Math.min(3,apps/12),45,94))}
module.exports=async function handler(req,res){
 try{
  const key=process.env.API_FOOTBALL_KEY;if(!key)return res.status(500).json({error:'API_FOOTBALL_KEY is not configured'});
  const season=Number(req.query.season||seasonFor());
  const td=await api('/teams?search=Oxford%20United',key);const team=rows(td).find(x=>/oxford united/i.test(x?.team?.name||''))||rows(td)[0];if(!team)return res.status(404).json({error:'Oxford United not found'});
  const teamId=team.team.id;
  const [fixtures,players]=await Promise.all([api(`/fixtures?team=${teamId}&season=${season}`,key),api(`/players?team=${teamId}&season=${season}`,key)]);
  const all=rows(fixtures),done=all.filter(f=>['FT','AET','PEN'].includes(f?.fixture?.status?.short)).sort((a,b)=>new Date(b.fixture.date)-new Date(a.fixture.date));
  const next=all.filter(f=>new Date(f.fixture.date)>new Date()&&['NS','TBD'].includes(f?.fixture?.status?.short)).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date));
  const form=done.slice(0,5).map(f=>{const home=f.teams.home.id===teamId,gf=home?f.goals.home:f.goals.away,ga=home?f.goals.away:f.goals.home;return gf>ga?'W':gf<ga?'L':'D'});
  const pool=[];for(const r of rows(players)){const st=(r.statistics||[])[0]||{};if(num(st.games?.minutes)<90)continue;pool.push({id:r.player.id,name:r.player.name,photo:r.player.photo||null,position:st.games?.position||'',role:role(st.games?.position),rating:rate(st),minutes:num(st.games?.minutes),apps:num(st.games?.appearences),goals:num(st.goals?.total),assists:num(st.goals?.assists)})}
  pool.sort((a,b)=>b.rating-a.rating);const choose=(r,n)=>pool.filter(p=>p.role===r).slice(0,n);const xi=[...choose('GK',1),...choose('DEF',4),...choose('MID',3),...choose('ATT',3)];const used=new Set(xi.map(x=>x.id));const bench=pool.filter(x=>!used.has(x.id)).slice(0,7);
  const gf=done.slice(0,10).reduce((s,f)=>{const h=f.teams.home.id===teamId;return s+num(h?f.goals.home:f.goals.away)},0)/Math.max(1,Math.min(10,done.length));
  const ga=done.slice(0,10).reduce((s,f)=>{const h=f.teams.home.id===teamId;return s+num(h?f.goals.away:f.goals.home)},0)/Math.max(1,Math.min(10,done.length));
  res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=7200');
  return res.status(200).json({team:{id:teamId,name:team.team.name,logo:team.team.logo},season,form,recentGF:+gf.toFixed(2),recentGA:+ga.toFixed(2),nextFixtures:next.slice(0,8),bestXI:xi,bench,generatedAt:new Date().toISOString()});
 }catch(e){return res.status(502).json({error:'Oxford intelligence failed',detail:e?.message||String(e)})}
}
