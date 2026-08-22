const ALLOWED_PREFIXES=[
  "/Competitions",
  "/Competition",
  "/CompetitionSeasons",
  "/Fixtures",
  "/HeadToHead/",
  "/Standings/"
];

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});

  const token=process.env.CORDAX_TOKEN;

  if(!token)return res.status(500).json({
    error:"CORDAX_TOKEN is not configured on Vercel"
  });

  const path=typeof req.query.path==="string"
    ? req.query.path
    : "";

  if(
    !path.startsWith("/") ||
    !ALLOWED_PREFIXES.some(p=>path.startsWith(p))
  ){
    return res.status(400).json({
      error:"Unsupported Cordax route"
    });
  }

  try{
    const upstream=await fetch(
      "https://api.cordax.net"+path,
      {
        headers:{
          Authorization:`Bearer ${token}`,
          Accept:"application/json"
        }
      }
    );

    const text=await upstream.text();

    res.setHeader(
      "Cache-Control",
      path.startsWith("/Standings/") ||
      path.startsWith("/Competitions")
        ? "s-maxage=300, stale-while-revalidate=1800"
        : "s-maxage=15, stale-while-revalidate=30"
    );

    const ct=upstream.headers.get("content-type")||"";

    if(ct.includes("application/json")){
      try{
        return res
          .status(upstream.status)
          .json(JSON.parse(text));
      }catch{}
    }

    if(!upstream.ok){
      return res.status(upstream.status).json({
        error:`Cordax returned ${upstream.status}`,
        detail:text.slice(0,300)
      });
    }

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    return res
      .status(upstream.status)
      .send(text);

  }catch(e){

    return res.status(502).json({
      error:"Could not reach Cordax",
      detail:e?.message||String(e)
    });

  }
};
