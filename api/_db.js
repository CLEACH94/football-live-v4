const url=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const dbEnabled=()=>!!(url()&&key());
async function db(path,{method='GET',body,prefer='return=representation'}={}){
  if(!dbEnabled())return null;
  const r=await fetch(url()+'/rest/v1/'+path,{method,headers:{apikey:key(),Authorization:`Bearer ${key()}`,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();
  if(!r.ok)throw new Error(`Database ${r.status}: ${text.slice(0,240)}`);
  return text?JSON.parse(text):null;
}

module.exports={db,dbEnabled};
