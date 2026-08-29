const db=require('./_db');
const {cachedApiFootball}=require('./_cache');
module.exports=async function handler(req,res){
 try{
  const id=Number(req.query?.fixture);if(!id)return res.status(400).json({error:'Missing fixture'});
  const key=process.env.API_FOOTBALL_KEY;if(!key)return res.status(500).json({error:'API_FOOTBALL_KEY missing'});
  const cached=await db.select('mi_live',`fixture_id=eq.${id}&select=payload,updated_at&limit=1`).catch(()=>[]);
  const row=cached?.[0],age=row?Date.now()-new Date(row.updated_at).getTime():Infinity;
  if(row&&age<45000)return res.status(200).json({...row.payload,cached:true});
  const [stats,events,fixture]=await Promise.all([
    cachedApiFootball(`/fixtures/statistics?fixture=${id}`,key,{ttlMs:60000,reason:'live:stats',critical:true}),
    cachedApiFootball(`/fixtures/events?fixture=${id}`,key,{ttlMs:60000,reason:'live:events',critical:true}),
    cachedApiFootball(`/fixtures?id=${id}`,key,{ttlMs:30000,reason:'live:fixture',critical:true})
  ]);
  const payload={fixture:fixture?.response?.[0]||null,stats,events,ts:Date.now()};
  await db.upsert('mi_live',{fixture_id:id,payload,updated_at:new Date().toISOString()},'fixture_id').catch(()=>{});
  res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');return res.status(200).json(payload);
 }catch(e){const code=e.code==='API_BUDGET'?429:502;return res.status(code).json({error:e.code==='API_BUDGET'?'Daily API budget protected':'Live data unavailable',detail:e.message||String(e),budget:e.budget||null})}
}
