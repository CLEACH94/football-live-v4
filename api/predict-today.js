const db=require('./_db');
const {fastScoutBatch,londonDate}=require('./_v17');
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed'});
  try{const day=londonDate();const rows=await db.select('mi_fixtures',`kickoff=gte.${encodeURIComponent(day+'T00:00:00Z')}&kickoff=lte.${encodeURIComponent(day+'T23:59:59Z')}&select=*&order=kickoff.asc`);const domestic=(rows||[]).filter(f=>[39,40,41,42,43,45,48].includes(Number(f.league_id))||/Oxford United/i.test(`${f.home_team} ${f.away_team}`));domestic.sort((a,b)=>{const ao=/Oxford United/i.test(`${a.home_team} ${a.away_team}`)?-1:0,bo=/Oxford United/i.test(`${b.home_team} ${b.away_team}`)?-1:0;return ao-bo||new Date(a.kickoff)-new Date(b.kickoff)});const target=domestic.slice(0,Math.max(1,Math.min(30,Number(req.query?.limit??req.body?.limit??30))));const out=await fastScoutBatch(target,{force:false});return res.status(200).json({ok:true,day,fixtures:target.length,ran:out.ran})}
  catch(e){const code=e.code==='API_BUDGET'?429:502;return res.status(code).json({ok:false,error:e.code==='API_BUDGET'?'Daily API reserve protected':'Today prediction pass failed',detail:e.message||String(e)})}
}
