const {refreshFixtures}=require('./_v17');
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed'});
  try{const days=Math.max(1,Math.min(14,Number(req.query?.days??req.body?.days??8)));const out=await refreshFixtures({days});return res.status(200).json({...out,version:'v17'})}
  catch(e){const code=e.code==='API_BUDGET'?429:502;return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'Fixture refresh failed',detail:e.message||String(e)})}
}
