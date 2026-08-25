const {db,dbEnabled}=require('./_db.js');
const safeFixture=f=>({fixture_id:String(f.fixtureId),home_team:f.homeTeam||null,away_team:f.awayTeam||null,home_team_id:f.homeTeamId||null,away_team_id:f.awayTeamId||null,competition:f.competition||null,kickoff:f.fixtureDate||null,league_id:f.leagueId||null,season:f.season||null,last_seen_at:new Date().toISOString()});
function auditRows(f,s){if(!s||s.stage==='scout')return[];return(s.predictions||[]).map(p=>({key:`${f.fixtureId}|${p.rule}|${s.model}|${s.stage}`,fixture_id:String(f.fixtureId),rule:p.rule,type:p.type,title:p.title,model:s.model,stage:s.stage,p:p.p,raw_p:p.rawP??p.p,lineup_confirmed:!!s.lineupConfirmed,kickoff:f.fixtureDate||p.kickoff||null,engines:p.stats?.engineProbabilities||null,ablation:p.stats?.ablation||null,correct:null,result:null}))}
module.exports=async function handler(req,res){
 try{
  if(!dbEnabled())return res.status(200).json({enabled:false,snapshots:[],audit:[]});
  const action=String(req.query.action||'list');
  if(req.method==='GET'&&action==='list'){
    const [snapshots,audit]=await Promise.all([db('mi_snapshots?select=fixture_id,snapshot,updated_at&order=updated_at.desc&limit=350'),db('mi_audit?select=*&order=created_at.desc&limit=12000')]);
    return res.status(200).json({enabled:true,snapshots:snapshots||[],audit:audit||[]});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(action==='register'){
    const fixtures=(req.body?.fixtures||[]).filter(x=>x?.fixtureId).map(safeFixture);if(fixtures.length)await db('mi_fixtures?on_conflict=fixture_id',{method:'POST',body:fixtures,prefer:'resolution=merge-duplicates,return=minimal'});return res.status(200).json({ok:true,count:fixtures.length});
  }
  if(action==='save'){
    const f=req.body?.fixture,s=req.body?.snapshot;if(!f?.fixtureId||!s)return res.status(400).json({error:'Missing fixture or snapshot'});await db('mi_fixtures?on_conflict=fixture_id',{method:'POST',body:[safeFixture(f)],prefer:'resolution=merge-duplicates,return=minimal'});await db('mi_snapshots?on_conflict=fixture_id',{method:'POST',body:[{fixture_id:String(f.fixtureId),model:s.model,stage:s.stage,lineup_confirmed:!!s.lineupConfirmed,snapshot:s,updated_at:new Date().toISOString()}],prefer:'resolution=merge-duplicates,return=minimal'});const audit=auditRows(f,s);if(audit.length)await db('mi_audit?on_conflict=key',{method:'POST',body:audit,prefer:'resolution=ignore-duplicates,return=minimal'});return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Unknown action'});
 }catch(e){return res.status(502).json({error:'Snapshot service failed',detail:e?.message||String(e)})}
}
