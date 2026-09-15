const {db,ensure,configured,j,p}=require('./_db');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(!configured()) return res.status(200).json({configured:false,predictions:{},history:[],audit:[],system:{status:'Turso not configured'}});
    await ensure(); const c=db();
    if(req.method==='GET'){
      const [pred,hist,audit,state,jobs]=await Promise.all([
        c.execute('SELECT fixture_id,payload FROM current_predictions'),
        c.execute('SELECT payload FROM history ORDER BY settled_at DESC LIMIT 5000'),
        c.execute('SELECT payload FROM model_audit ORDER BY updated_at DESC LIMIT 12000'),
        c.execute("SELECT state_key,payload FROM app_state"),
        c.execute('SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 100')
      ]);
      const predictions={}; for(const r of pred.rows) predictions[String(r.fixture_id)]=p(r.payload,{});
      const appState={}; for(const r of state.rows) appState[String(r.state_key)]=p(r.payload,null);
      return res.status(200).json({configured:true,predictions,history:hist.rows.map(r=>p(r.payload,{})),audit:audit.rows.map(r=>p(r.payload,{})),appState,jobs:jobs.rows});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const b=req.body||{}; const now=new Date().toISOString();
    if(b.action==='upsertPrediction'){
      const fixtureId=String(b.fixtureId||''); if(!fixtureId) return res.status(400).json({error:'fixtureId required'});
      const payload=b.payload||{}; const stage=payload.stage||b.stage||'initial'; const model=payload.model||b.modelVersion||'unknown';
      await c.execute({sql:`INSERT INTO current_predictions(fixture_id,payload,stage,model_version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET payload=excluded.payload,stage=excluded.stage,model_version=excluded.model_version,updated_at=excluded.updated_at`,args:[fixtureId,j(payload),stage,model,now]});
      const cycle=String(b.cycleId||now.slice(0,13));
      await c.execute({sql:`INSERT OR IGNORE INTO prediction_versions(fixture_id,stage,model_version,cycle_id,payload,prediction_ts,data_cutoff_ts,feature_version,calibration_version,is_complete) VALUES(?,?,?,?,?,?,?,?,?,1)`,args:[fixtureId,stage,model,cycle,j(payload),b.predictionTs||now,b.dataCutoffTs||now,b.featureVersion||'v16-feature-1',b.calibrationVersion||'v16-cal-1']});
      return res.status(200).json({ok:true});
    }
    if(b.action==='syncAudit'){
      const rows=Array.isArray(b.rows)?b.rows:[];
      for(const row of rows){const key=String(row.key||row.id||'');if(!key)continue;await c.execute({sql:`INSERT INTO model_audit(audit_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(audit_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,args:[key,j(row),now]})}
      return res.status(200).json({ok:true,count:rows.length});
    }
    if(b.action==='syncHistory'){
      const rows=Array.isArray(b.rows)?b.rows:[];
      for(const row of rows){const id=String(row.id||'');if(!id)continue;await c.execute({sql:`INSERT INTO history(id,payload,settled_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,settled_at=excluded.settled_at`,args:[id,j(row),row.settledAt||now]})}
      return res.status(200).json({ok:true,count:rows.length});
    }
    if(b.action==='setState'){
      const key=String(b.key||'');if(!key)return res.status(400).json({error:'key required'});
      await c.execute({sql:`INSERT INTO app_state(state_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(state_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,args:[key,j(b.payload),now]});
      return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch(e){return res.status(502).json({error:'State service failed',detail:e?.message||String(e)})}
}
