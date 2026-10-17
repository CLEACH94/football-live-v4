const {runWorker}=require('./_engine');
module.exports=async function handler(req,res){
 const auth=req.headers?.authorization||req.headers?.Authorization;
 if(!process.env.CRON_SECRET||auth!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({ok:false,error:'Unauthorized'});
 try{return res.status(200).json(await runWorker({maxTeams:220,maxPredictions:6,fullCycle:true,source:'daily-cron'}))}catch(e){const code=e.code==='API_BUDGET'?429:500;return res.status(code).json({ok:false,error:e.message||String(e),budget:e.budget||null})}
}
