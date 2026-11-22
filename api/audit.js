const db=require('./_db');
function normalise(x){if(!x||typeof x!=='object')return null;const key=String(x.key||'').slice(0,300);if(!key)return null;return{audit_key:key,payload:x,updated_at:new Date().toISOString()}}
function pct(a,b){return b?Math.round(a/b*100):null}
function groupedSummary(records){
 const settled=records.filter(x=>typeof x?.correct==='boolean');
 const groups=new Map();for(const r of settled){const k=`${r.fixtureId}|${r.stage||'unknown'}|${r.model||''}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 let x1n=0,x1c=0,x1BrierSum=0,bestN=0,bestC=0;const stages={scout:[0,0],deep:[0,0],final:[0,0]};
 for(const rows of groups.values()){
   const x1=rows.filter(x=>['homeWin','draw','awayWin'].includes(x.rule));
   if(x1.length===3){x1n++;const top=x1.slice().sort((a,b)=>Number(b.p)-Number(a.p))[0];if(top.correct)x1c++;let bs=0;for(const x of x1){const p=(Number(x.p)||0)/100,y=x.correct?1:0;bs+=(p-y)**2}x1BrierSum+=bs/3}
   const eligible=new Set(['homeOrDraw','awayOrDraw','btts','over1.5','over2.5','under3.5']);const candidates=rows.filter(x=>eligible.has(x.rule));if(candidates.length){const best=candidates.slice().sort((a,b)=>Number(b.p)-Number(a.p))[0];bestN++;if(best.correct)bestC++;const st=String(best.stage||'').toLowerCase();const key=st==='initial'?'scout':st;if(stages[key]){stages[key][1]++;if(best.correct)stages[key][0]++}}
 }
 const btts=settled.filter(x=>x.rule==='btts'),bttsC=btts.filter(x=>x.correct).length;
 return{settledForecastRows:settled.length,settledFixtures:groups.size,bestPrediction:{n:bestN,pct:pct(bestC,bestN)},oneX:{n:x1n,pct:pct(x1c,x1n),multiclassBrier:x1n?+(x1BrierSum/x1n).toFixed(3):null},btts:{n:btts.length,pct:pct(bttsC,btts.length)},stages:{scout:{n:stages.scout[1],pct:pct(stages.scout[0],stages.scout[1])},deep:{n:stages.deep[1],pct:pct(stages.deep[0],stages.deep[1])},final:{n:stages.final[1],pct:pct(stages.final[0],stages.final[1])}}};
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');if(!db.configured())return res.status(503).json({ok:false,error:'Turso is not configured'});
 try{if(req.method==='GET'){const rows=await db.select('mi_model_audit','select=audit_key,payload,updated_at&order=updated_at.desc&limit=20000'),records=(rows||[]).map(r=>r.payload).filter(Boolean);return res.status(200).json({ok:true,summary:groupedSummary(records),recent:String(req.query?.summary||'')==='1'?records.slice(0,30):records})}if(req.method==='POST'){const src=Array.isArray(req.body?.records)?req.body.records:[],rows=src.map(normalise).filter(Boolean).slice(0,12000);if(rows.length)await db.upsert('mi_model_audit',rows,'audit_key');return res.status(200).json({ok:true,stored:rows.length})}return res.status(405).json({ok:false,error:'Method not allowed'})}catch(e){return res.status(502).json({ok:false,error:'Audit store unavailable',detail:e.message||String(e)})}
}
