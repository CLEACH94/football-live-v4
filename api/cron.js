const {refreshFixtures,settleRecent}=require('./_v17');
module.exports=async function handler(req,res){
 try{const secret=process.env.CRON_SECRET;if(secret&&req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({ok:false,error:'Unauthorized'});const refresh=await refreshFixtures({days:8}),settled=await settleRecent();return res.status(200).json({ok:true,version:'v17',refresh,settled})}catch(e){return res.status(502).json({ok:false,error:'Cron maintenance failed',detail:e.message||String(e)})}
}
