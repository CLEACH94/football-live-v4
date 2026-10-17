const db=require('./_db');
function normalise(x){
  if(!x||typeof x!=='object')return null;
  const key=String(x.key||'').slice(0,300);if(!key)return null;
  return {audit_key:key,payload:x,updated_at:new Date().toISOString()};
}
module.exports=async function handler(req,res){
  if(!db.configured())return res.status(503).json({ok:false,error:'Supabase is not configured'});
  try{
    if(req.method==='GET'){
      const rows=await db.select('mi_model_audit','select=audit_key,payload,updated_at&order=updated_at.asc&limit=20000');
      return res.status(200).json({ok:true,records:(rows||[]).map(r=>r.payload).filter(Boolean)});
    }
    if(req.method==='POST'){
      const src=Array.isArray(req.body?.records)?req.body.records:[];
      const rows=src.map(normalise).filter(Boolean).slice(0,12000);
      if(rows.length)await db.upsert('mi_model_audit',rows,'audit_key');
      return res.status(200).json({ok:true,stored:rows.length});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){return res.status(502).json({ok:false,error:'Audit store unavailable',detail:e.message||String(e)})}
}
