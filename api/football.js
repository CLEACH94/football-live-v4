const {apiFootball}=require('./_quota');
module.exports=async function handler(req,res){
  try{
    const key=process.env.API_FOOTBALL_KEY;
    if(!key)return res.status(500).json({error:'API_FOOTBALL_KEY is not configured'});
    const {endpoint,...rest}=req.query||{};
    const safe=String(endpoint||'').replace(/^\/+|[^a-zA-Z0-9/_-]/g,'');
    if(!safe)return res.status(400).json({error:'Missing endpoint'});
    const qs=new URLSearchParams();for(const [k,v] of Object.entries(rest)){if(v!==undefined&&v!==null&&v!=='')qs.set(k,String(v))}
    const critical=safe.includes('lineups')||String(rest.live||'')!==''||safe.includes('events');
    const d=await apiFootball(`/${safe}${qs.size?'?'+qs.toString():''}`,key,{reason:`proxy:${safe}`,critical});
    res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=120');return res.status(200).json(d);
  }catch(e){const code=e.code==='API_BUDGET'?429:502;return res.status(code).json({error:e.code==='API_BUDGET'?'Daily API budget protected':'Football data request failed',detail:e?.message||String(e),budget:e.budget||null})}
}
