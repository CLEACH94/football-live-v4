const {runWorker}=require('./_engine');
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed'});
  try{
    const body=req.body||{};
    // Browser worker is deliberately bounded. The full pool sweep is reserved for the
    // authenticated daily cron so a public URL cannot burn the entire API allowance.
    const out=await runWorker({
      maxTeams:Math.min(40,Math.max(5,Number(body.maxTeams||req.query?.maxTeams||25))),
      maxPredictions:Math.min(6,Math.max(0,Number(body.maxPredictions||req.query?.maxPredictions||3))),
      fullCycle:false,
      source:'browser'
    });
    return res.status(200).json(out);
  }catch(e){
    const code=e.code==='API_BUDGET'?429:502;
    return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'Worker failed',detail:e.message||String(e),budget:e.budget||null});
  }
}
