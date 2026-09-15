const BASE='https://v3.football.api-sports.io';
const rows=d=>Array.isArray(d?.response)?d.response:[];
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
async function api(path,key){const r=await fetch(BASE+path,{headers:{'x-apisports-key':key}});const d=await r.json();if(!r.ok)throw new Error(`API ${r.status}`);return d}
function seasonFor(){const d=new Date();return d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1}
function pois(lambda){let L=Math.exp(-lambda),k=0,p=1;do{k++;p*=Math.random()}while(p>L&&k<12);return k-1}
module.exports=async function handler(req,res){
 try{
  const key=process.env.API_FOOTBALL_KEY;if(!key)return res.status(500).json({error:'API_FOOTBALL_KEY is not configured'});
  const league=Number(req.query.league||40),season=Number(req.query.season||seasonFor()),sims=clamp(Number(req.query.sims||25000),5000,100000);
  const [sd,fd]=await Promise.all([api(`/standings?league=${league}&season=${season}`,key),api(`/fixtures?league=${league}&season=${season}`,key)]);
  const table=(sd?.response?.[0]?.league?.standings||[]).flat();if(!table.length)return res.status(404).json({error:'No standings available'});
  const teams=table.map(r=>({id:r.team.id,name:r.team.name,pts:num(r.points),gd:num(r.goalsDiff),gf:num(r.all?.goals?.for),ga:num(r.all?.goals?.against),played:num(r.all?.played)}));
  const byId=new Map(teams.map(t=>[t.id,t]));const remaining=rows(fd).filter(f=>['NS','TBD'].includes(f?.fixture?.status?.short));
  const leagueGF=teams.reduce((a,t)=>a+t.gf,0)/Math.max(1,teams.reduce((a,t)=>a+t.played,0));const base=Math.max(.7,leagueGF/2);
  const strength=new Map();for(const t of teams){const p=Math.max(1,t.played),attack=clamp((t.gf/p)/Math.max(.4,base),.55,1.65),def=clamp((t.ga/p)/Math.max(.4,base),.55,1.65);strength.set(t.id,{attack,def})}
  const dist=new Map(teams.map(t=>[t.id,Array(teams.length).fill(0)]));
  for(let s=0;s<sims;s++){
    const latent=new Map();for(const t of teams){const z=(Math.random()+Math.random()+Math.random()+Math.random()-2)*.08;latent.set(t.id,1+z)}
    const sim=new Map(teams.map(t=>[t.id,{pts:t.pts,gd:t.gd,gf:t.gf}]));
    for(const f of remaining){const h=f.teams.home.id,a=f.teams.away.id;if(!sim.has(h)||!sim.has(a))continue;const hs=strength.get(h),as=strength.get(a);const lh=clamp(base*1.10*hs.attack/as.def*latent.get(h),.2,3.4),la=clamp(base*.92*as.attack/hs.def*latent.get(a),.18,3.1);const hg=pois(lh),ag=pois(la),H=sim.get(h),A=sim.get(a);H.gf+=hg;A.gf+=ag;H.gd+=hg-ag;A.gd+=ag-hg;if(hg>ag)H.pts+=3;else if(ag>hg)A.pts+=3;else{H.pts++;A.pts++}}
    const order=[...teams].sort((x,y)=>{const X=sim.get(x.id),Y=sim.get(y.id);return Y.pts-X.pts||Y.gd-X.gd||Y.gf-X.gf||x.name.localeCompare(y.name)});order.forEach((t,i)=>dist.get(t.id)[i]++);
  }
  const output=teams.map(t=>{const d=dist.get(t.id).map(x=>x/sims),best=d.indexOf(Math.max(...d))+1;const cdf=[];let c=0;d.forEach(x=>{c+=x;cdf.push(c)});const q=p=>cdf.findIndex(x=>x>=p)+1;return{id:t.id,name:t.name,currentPosition:table.find(r=>r.team.id===t.id)?.rank||null,predictedPosition:best,exactChance:+(d[best-1]*100).toFixed(1),range75:[q(.125),q(.875)],range90:[q(.05),q(.95)],distribution:d.map(x=>+(x*100).toFixed(2))}}).sort((a,b)=>a.predictedPosition-b.predictedPosition||b.exactChance-a.exactChance);
  res.setHeader('Cache-Control','no-store');return res.status(200).json({league,season,simulations:sims,teams:output,generatedAt:new Date().toISOString(),method:'Monte Carlo scoreline simulation with coherent latent team-strength draws'});
 }catch(e){return res.status(502).json({error:'League Predictor failed',detail:e?.message||String(e)})}
}
