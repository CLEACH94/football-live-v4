const {runWorker}=require('./_engine');
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed'});
  try{
    const body=req.body||{},phase=String(body.phase||req.query?.phase||'auto');
    const allowed=new Set(['discover','scout','deep','auto']);
    const out=await runWorker({
      maxTeams:Math.min(16,Math.max(0,Number(body.maxTeams??req.query?.maxTeams??8))),
      maxPredictions:Math.min(8,Math.max(0,Number(body.maxPredictions??req.query?.maxPredictions??6))),
      fullCycle:false,
      focusOxford:body.focusOxford===true||String(req.query?.focusOxford||'')==='1',
      phase:allowed.has(phase)?phase:'auto',
      source:'browser'
    });
    return res.status(200).json(out);
  }catch(e){
    const code=e.code==='API_BUDGET'?429:502;
    return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'Worker failed',detail:e.message||String(e),budget:e.budget||null});
  }
}
