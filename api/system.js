const {db,ensure,configured}=require('./_db');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const out={database:{configured:configured(),ok:false},worker:{mode:'GitHub Actions / manual'},apiReserve:2000,generatedAt:new Date().toISOString()};
    if(configured()){
      await ensure(); const c=db();
      const [pred,jobs,state]=await Promise.all([c.execute('SELECT COUNT(*) n, MAX(updated_at) latest FROM current_predictions'),c.execute('SELECT status,COUNT(*) n FROM jobs GROUP BY status'),c.execute("SELECT payload FROM app_state WHERE state_key='last_worker_status'")]);
      out.database.ok=true;out.database.predictions=Number(pred.rows[0]?.n||0);out.database.latest=pred.rows[0]?.latest||null;out.jobs=jobs.rows;out.lastWorker=state.rows[0]?.payload?JSON.parse(state.rows[0].payload):null;
    }
    return res.status(200).json(out);
  }catch(e){return res.status(502).json({error:'System status failed',detail:e?.message||String(e)})}
}
