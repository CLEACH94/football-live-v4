const {fixturesForLeague,fastScoutBatch,londonDate}=require('./_v17');
function dayRange(view){if(view==='today')return[londonDate(),londonDate()];if(view==='tomorrow')return[londonDate(1),londonDate(1)];return[londonDate(),londonDate(7)]}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  try{const leagueId=Number(req.body?.leagueId);if(![39,40,41,42,43].includes(leagueId))return res.status(400).json({ok:false,error:'Choose an English league'});const [from,to]=dayRange(String(req.body?.view||'today'));const fixtures=await fixturesForLeague(leagueId,{from,to});const target=fixtures.filter(f=>!['FT','AET','PEN'].includes(f.status));const out=await fastScoutBatch(target,{force:req.body?.force===true});return res.status(200).json({ok:true,leagueId,view:req.body?.view||'today',fixtures:target.length,ran:out.ran,predictions:out.predictions})}
  catch(e){const code=e.code==='API_BUDGET'?429:502;return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'League prediction failed',detail:e.message||String(e)})}
}
