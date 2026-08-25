const BASE='https://v3.football.api-sports.io';
module.exports=async function handler(req,res){
  try{
    const key=process.env.API_FOOTBALL_KEY;
    if(!key)return res.status(500).json({error:'API_FOOTBALL_KEY is not configured'});
    const {endpoint,...rest}=req.query||{};
    const safe=String(endpoint||'').replace(/^\/+|[^a-zA-Z0-9/_-]/g,'');
    if(!safe)return res.status(400).json({error:'Missing endpoint'});
    const qs=new URLSearchParams();
    for(const [k,v] of Object.entries(rest)){ if(v!==undefined&&v!==null&&v!=='') qs.set(k,String(v)); }
    const r=await fetch(`${BASE}/${safe}${qs.size?'?'+qs.toString():''}`,{headers:{'x-apisports-key':key}});
    const text=await r.text();
    res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=120');
    res.status(r.status).send(text);
  }catch(e){res.status(502).json({error:'Football data request failed',detail:e?.message||String(e)})}
}
