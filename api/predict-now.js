const {getFixture,fastScoutBatch,deepPredict}=require('./_v17');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  try{const id=Number(req.body?.fixtureId);if(!id)return res.status(400).json({ok:false,error:'fixtureId required'});const f=await getFixture(id);if(!f)return res.status(404).json({ok:false,error:'Fixture not stored'});const mode=String(req.body?.mode||'scout');if(mode==='deep'){const p=await deepPredict(f);return res.status(200).json({ok:true,fixtureId:id,stage:p.lineupConfirmed?'final':'deep',prediction:p})}const r=await fastScoutBatch([f],{force:req.body?.force===true});return res.status(200).json({ok:true,fixtureId:id,stage:'scout',prediction:r.predictions?.[0]||null})}
  catch(e){const code=e.code==='API_BUDGET'?429:502;return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'Prediction failed',detail:e.message||String(e)})}
}
