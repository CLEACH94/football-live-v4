const db=require('./_db');
function normalise(x){if(!x||typeof x!=='object')return null;const key=String(x.key||'').slice(0,300);if(!key)return null;return{audit_key:key,payload:x,updated_at:new Date().toISOString()}}
function pct(rows){return rows.length?Math.round(rows.filter(x=>x.correct===true).length/rows.length*100):null}
function summary(records){
 const settled=records.filter(x=>typeof x?.correct==='boolean'),correct=settled.filter(x=>x.correct).length;
 const by=(fn)=>settled.filter(fn),oneX=by(x=>['homeWin','draw','awayWin'].includes(x.rule)),btts=by(x=>x.rule==='btts'),initial=by(x=>['scout','initial'].includes(String(x.stage||'').toLowerCase())),deep=by(x=>String(x.stage||'').toLowerCase()==='deep'),final=by(x=>String(x.stage||'').toLowerCase()==='final'||x.lineupConfirmed===true),last30=by(x=>new Date(x.settledAt||0).getTime()>=Date.now()-30*86400000);
 const brier=settled.length?settled.reduce((s,x)=>{const p=(Number(x.p)||0)/100,y=x.correct?1:0;return s+(p-y)**2},0)/settled.length:null;
 return{settled:settled.length,correct,hitRate:pct(settled),brier:brier===null?null:+brier.toFixed(3),oneX:{n:oneX.length,pct:pct(oneX)},btts:{n:btts.length,pct:pct(btts)},initial:{n:initial.length,pct:pct(initial)},deep:{n:deep.length,pct:pct(deep)},final:{n:final.length,pct:pct(final)},last30:{n:last30.length,pct:pct(last30)}};
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 if(!db.configured())return res.status(503).json({ok:false,error:'Turso is not configured'});
 try{
  if(req.method==='GET'){
   const rows=await db.select('mi_model_audit','select=audit_key,payload,updated_at&order=updated_at.desc&limit=20000');const records=(rows||[]).map(r=>r.payload).filter(Boolean);
   if(String(req.query?.summary||'')==='1')return res.status(200).json({ok:true,summary:summary(records),recent:records.slice(0,50)});
   return res.status(200).json({ok:true,records});
  }
  if(req.method==='POST'){const src=Array.isArray(req.body?.records)?req.body.records:[],rows=src.map(normalise).filter(Boolean).slice(0,12000);if(rows.length)await db.upsert('mi_model_audit',rows,'audit_key');return res.status(200).json({ok:true,stored:rows.length})}
  return res.status(405).json({ok:false,error:'Method not allowed'});
 }catch(e){return res.status(502).json({ok:false,error:'Audit store unavailable',detail:e.message||String(e)})}
}
