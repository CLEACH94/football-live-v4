const {manualLineupSearch}=require('./_engine');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  try{
    const tier=Number(req.body?.tier||0);
    if(![1,2,3,4,5].includes(tier))return res.status(400).json({ok:false,error:'Choose a valid English division'});
    const out=await manualLineupSearch({tier,maxFixtures:24});
    return res.status(200).json(out);
  }catch(e){
    const code=e.code==='API_BUDGET'?429:502;
    return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'Line-up search failed',detail:e.message||String(e)});
  }
}
