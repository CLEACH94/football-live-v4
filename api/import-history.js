const {db,ensure,configured,j}=require('./_db');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    if(!configured())return res.status(503).json({error:'Turso is not configured'});
    await ensure(); const c=db(),b=req.body||{},now=new Date().toISOString();
    let predictions=0,history=0,audit=0;
    for(const [fixtureId,payload] of Object.entries(b.predictionCache||{})){
      if(!payload||typeof payload!=='object')continue;
      await c.execute({sql:`INSERT INTO current_predictions(fixture_id,payload,stage,model_version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET payload=excluded.payload,stage=excluded.stage,model_version=excluded.model_version,updated_at=excluded.updated_at`,args:[String(fixtureId),j(payload),payload.stage||'legacy',payload.model||'legacy',now]}); predictions++;
    }
    for(const row of Array.isArray(b.history)?b.history:[]){if(!row?.id)continue;await c.execute({sql:`INSERT INTO history(id,payload,settled_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING`,args:[String(row.id),j(row),row.settledAt||now]});history++}
    for(const row of Array.isArray(b.audit)?b.audit:[]){const key=row?.key||row?.id;if(!key)continue;await c.execute({sql:`INSERT INTO model_audit(audit_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(audit_key) DO NOTHING`,args:[String(key),j(row),now]});audit++}
    return res.status(200).json({ok:true,predictions,history,audit});
  }catch(e){return res.status(502).json({error:'Import failed',detail:e?.message||String(e)})}
}
