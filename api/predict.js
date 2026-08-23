const API = "https://v3.football.api-sports.io";
const MODEL_VERSION = "v12-ensemble-lineup";

const LEAGUES = {
  39:{score:1.00,label:"Premier League"},
  40:{score:.90,label:"Championship"},
  41:{score:.82,label:"League One"},
  42:{score:.76,label:"League Two"},
  45:{score:.82,label:"FA Cup"},
  48:{score:.82,label:"League Cup"},
  2:{score:1.00,label:"Champions League"},
  3:{score:.94,label:"Europa League"},
  848:{score:.88,label:"Conference League"},
  179:{score:.78,label:"Scottish Premiership"},
  140:{score:.96,label:"La Liga"},
  78:{score:.96,label:"Bundesliga"},
  135:{score:.95,label:"Serie A"},
  61:{score:.93,label:"Ligue 1"},
  88:{score:.86,label:"Eredivisie"},
  94:{score:.86,label:"Primeira Liga"}
};

const cache = new Map();

const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const num = (v,f=null) => Number.isFinite(Number(v)) ? Number(v) : f;
const rows = d => Array.isArray(d?.response) ? d.response : [];

async function api(path,key,ttl=0){
  if(
    ttl &&
    cache.has(path) &&
    Date.now()-cache.get(path).time < ttl
  ){
    return cache.get(path).data;
  }

  const r = await fetch(API+path,{
    headers:{
      "x-apisports-key":key
    }
  });

  const d = await r.json();

  if(!r.ok){
    throw new Error(`API-Football HTTP ${r.status}`);
  }

  if(
    d?.errors &&
    (
      Array.isArray(d.errors)
        ? d.errors.length
        : Object.keys(d.errors).length
    )
  ){
    throw new Error(
      Array.isArray(d.errors)
        ? d.errors.join(", ")
        : JSON.stringify(d.errors)
    );
  }

  if(ttl){
    cache.set(path,{
      time:Date.now(),
      data:d
    });
  }

  return d;
}

async function mapLimit(items,limit,fn){
  const out=[];
  let i=0;

  async function worker(){
    while(i<items.length){
      const idx=i++;
      try{
        out[idx]=await fn(items[idx],idx);
      }catch{
        out[idx]=null;
      }
      await wait(90);
    }
  }

  await Promise.all(
    Array.from(
      {
        length:Math.min(limit,items.length)
      },
      worker
    )
  );

  return out;
}

function seasonFor(date){
  const d=new Date(date);
  const y=d.getUTCFullYear();

  return d.getUTCMonth()+1>=7
    ? y
    : y-1;
}

function done(f){
  return [
    "FT",
    "AET",
    "PEN"
  ].includes(
    f?.fixture?.status?.short || ""
  );
}

function teamSide(f,id){
  if(f?.teams?.home?.id===id) return "home";
  if(f?.teams?.away?.id===id) return "away";
  return null;
}

function gfga(f,id){
  const side=teamSide(f,id);

  const h=num(f?.goals?.home);
  const a=num(f?.goals?.away);

  if(
    !side ||
    h===null ||
    a===null
  ){
    return null;
  }

  return side==="home"
    ? [h,a]
    : [a,h];
}

function recent(
  all,
  id,
  before,
  limit=20,
  side=null
){
  return all
    .filter(done)
    .filter(
      f =>
        new Date(f.fixture.date) <
        before
    )
    .filter(
      f =>
        teamSide(f,id)
    )
    .filter(
      f =>
        !side ||
        teamSide(f,id)===side
    )
    .sort(
      (a,b) =>
        new Date(b.fixture.date) -
        new Date(a.fixture.date)
    )
    .slice(0,limit);
}

function weightedAvg(
  list,
  id,
  index,
  decay=.90
){
  let n=0;
  let d=0;

  list.forEach(
    (f,i) => {
      const x=gfga(f,id);
      if(!x) return;

      const w=Math.pow(decay,i);

      n += x[index]*w;
      d += w;
    }
  );

  return d
    ? n/d
    : null;
}

function ppg(list,id){
  let n=0;
  let d=0;

  list.forEach(
    (f,i) => {
      const x=gfga(f,id);
      if(!x) return;

      const pts =
        x[0]>x[1]
          ? 3
          : x[0]===x[1]
          ? 1
          : 0;

      const w=Math.pow(.92,i);

      n += pts*w;
      d += w;
    }
  );

  return d
    ? n/d
    : 1.35;
}

function form(list,id){
  return list
    .slice(0,5)
    .map(
      f => {
        const x=gfga(f,id);

        if(!x) return "D";
        if(x[0]>x[1]) return "W";
        if(x[0]<x[1]) return "L";

        return "D";
      }
    );
}

function hitRate(
  list,
  rule,
  id
){
  let hit=0;
  let valid=0;

  for(
    const f of list.slice(0,10)
  ){
    const x=gfga(f,id);

    if(!x) continue;

    valid++;

    const gf=x[0];
    const ga=x[1];
    const t=gf+ga;

    if(
      rule==="team05" &&
      gf>=1
    ){
      hit++;
    }

    if(
      rule==="over15" &&
      t>=2
    ){
      hit++;
    }

    if(
      rule==="over25" &&
      t>=3
    ){
      hit++;
    }

    if(
      rule==="under35" &&
      t<=3
    ){
      hit++;
    }

    if(
      rule==="under45" &&
      t<=4
    ){
      hit++;
    }

    if(
      rule==="btts" &&
      gf>0 &&
      ga>0
    ){
      hit++;
    }

    if(
      rule==="nonloss" &&
      gf>=ga
    ){
      hit++;
    }

    if(
      rule==="win" &&
      gf>ga
    ){
      hit++;
    }

    if(
      rule==="draw" &&
      gf===ga
    ){
      hit++;
    }
  }

  return valid
    ? Math.round(
        100*hit/valid
      )
    : 0;
}

function shrink(
  obs,
  n,
  base,
  strength=8
){
  if(
    !Number.isFinite(obs)
  ){
    return base;
  }

  const w =
    n/(n+strength);

  return (
    obs*w +
    base*(1-w)
  );
}

function seasonStat(
  d,
  path,
  fallback=null
){
  let x=d?.response;

  for(
    const p of path
  ){
    x=x?.[p];
  }

  return num(
    x,
    fallback
  );
}

function standing(
  d,
  id
){
  const flat=
    (
      d?.response?.[0]
        ?.league
        ?.standings ||
      []
    ).flat();

  const r=
    flat.find(
      x =>
        x?.team?.id===id
    );

  if(!r){
    return null;
  }

  return {
    pos:num(r.rank),
    total:flat.length,
    gd:num(
      r.goalsDiff,
      0
    ),
    points:num(
      r.points,
      0
    )
  };
}

function factorial(n){
  let r=1;

  for(
    let i=2;
    i<=n;
    i++
  ){
    r*=i;
  }

  return r;
}

function pois(k,l){
  return (
    Math.exp(-l) *
    Math.pow(l,k) /
    factorial(k)
  );
}

function dixonColesMatrix(
  lh,
  la,
  rho=-.075
){
  let home=0;
  let draw=0;
  let away=0;
  let total=0;

  for(
    let h=0;
    h<=9;
    h++
  ){
    for(
      let a=0;
      a<=9;
      a++
    ){
      let tau=1;

      if(
        h===0 &&
        a===0
      ){
        tau=
          1 -
          lh*la*rho;
      }

      if(
        h===0 &&
        a===1
      ){
        tau=
          1 +
          lh*rho;
      }

      if(
        h===1 &&
        a===0
      ){
        tau=
          1 +
          la*rho;
      }

      if(
        h===1 &&
        a===1
      ){
        tau=
          1-rho;
      }

      const p=Math.max(
        0,
        pois(h,lh) *
        pois(a,la) *
        tau
      );

      total+=p;

      if(h>a){
        home+=p;
      }else if(h===a){
        draw+=p;
      }else{
        away+=p;
      }
    }
  }

  return {
    home:home/total,
    draw:draw/total,
    away:away/total
  };
}

function goalProbs(
  lh,
  la
){
  const t=lh+la;
  const e=Math.exp(-t);

  return {
    over15:
      1 -
      e*(1+t),

    over25:
      1 -
      e*(
        1 +
        t +
        t*t/2
      ),

    under35:
      e*(
        1 +
        t +
        t*t/2 +
        t*t*t/6
      ),

    under45:
      e*(
        1 +
        t +
        t*t/2 +
        t*t*t/6 +
        t**4/24
      )
  };
}

function statValue(
  teamStats,
  type
){
  const item=
    (teamStats||[])
      .find(
        x =>
          String(
            x?.type||""
          ).toLowerCase()
          ===
          type.toLowerCase()
      );

  const v=item?.value;

  if(
    typeof v==="string" &&
    v.endsWith("%")
  ){
    return num(
      v.slice(0,-1)
    );
  }

  return num(v);
}

function chanceProfile(
  statResponses,
  teamId
){
  let sot=0;
  let shots=0;
  let corners=0;
  let poss=0;
  let n=0;

  for(
    const d of
      statResponses.filter(Boolean)
  ){
    const team=
      d?.response
        ?.find(
          x =>
            x?.team?.id===teamId
        );

    if(!team){
      continue;
    }

    const s=
      team.statistics || [];

    const a=
      statValue(
        s,
        "Shots on Goal"
      );

    const b=
      statValue(
        s,
        "Total Shots"
      );

    const c=
      statValue(
        s,
        "Corner Kicks"
      );

    const p=
      statValue(
        s,
        "Ball Possession"
      );

    if(
      a===null &&
      b===null
    ){
      continue;
    }

    sot += a || 0;
    shots += b || 0;
    corners += c || 0;
    poss += p || 50;

    n++;
  }

  if(!n){
    return null;
  }

  const sotAvg=sot/n;
  const shotsAvg=shots/n;
  const cornersAvg=corners/n;
  const possAvg=poss/n;

  const pressure=
    clamp(
      .45*sotAvg +
      .075*shotsAvg +
      .055*cornersAvg +
      .012*(possAvg-50),
      0,
      5
    );

  return {
    sot:
      +sotAvg.toFixed(1),

    shots:
      +shotsAvg.toFixed(1),

    corners:
      +cornersAvg.toFixed(1),

    poss:
      +possAvg.toFixed(1),

    pressure:
      +pressure.toFixed(2),

    sample:n
  };
}

function lineupInfo(d){
  const ls=rows(d);

  if(ls.length<2){
    return {
      confirmed:false,
      lineups:[]
    };
  }

  const good=
    ls.filter(
      x =>
        Array.isArray(
          x?.startXI
        ) &&
        x.startXI.length>=11
    );

  return {
    confirmed:
      good.length>=2,

    lineups:good
  };
}

function lineupFor(
  info,
  teamId
){
  return info.lineups
    .find(
      x =>
        x?.team?.id===teamId
    ) || null;
}

function xiIds(lineup){
  return (
    lineup?.startXI || []
  )
    .map(
      x =>
        x?.player?.id
    )
    .filter(Boolean);
}

function playerMap(
  playerData
){
  const map=new Map();

  for(
    const r of
      playerData.flatMap(rows)
  ){
    const id=
      r?.player?.id;

    if(!id){
      continue;
    }

    const stats=
      (
        r.statistics || []
      )[0] || {};

    map.set(
      id,
      {
        rating:
          num(
            stats?.games?.rating,
            6.5
          ),

        minutes:
          num(
            stats?.games?.minutes,
            0
          ),

        goals:
          num(
            stats?.goals?.total,
            0
          ),

        assists:
          num(
            stats?.goals?.assists,
            0
          ),

        shots:
          num(
            stats?.shots?.on,
            0
          ),

        passes:
          num(
            stats?.passes?.key,
            0
          ),

        tackles:
          num(
            stats?.tackles?.total,
            0
          ),

        interceptions:
          num(
            stats?.tackles?.interceptions,
            0
          )
      }
    );
  }

  return map;
}

function xiStrength(
  ids,
  map
){
  if(!ids.length){
    return null;
  }

  const vals=
    ids
      .map(
        id =>
          map.get(id)
      )
      .filter(Boolean);

  if(vals.length<6){
    return null;
  }

  const rating=
    vals.reduce(
      (a,x) =>
        a+x.rating,
      0
    ) /
    vals.length;

  const attack=
    vals.reduce(
      (a,x) =>
        a +
        x.goals*1.0 +
        x.assists*.7 +
        x.shots*.10 +
        x.passes*.05,
      0
    ) /
    vals.length;

  const defence=
    vals.reduce(
      (a,x) =>
        a +
        x.tackles*.06 +
        x.interceptions*.10,
      0
    ) /
    vals.length;

  return {
    rating:
      +rating.toFixed(2),

    attack:
      +attack.toFixed(2),

    defence:
      +defence.toFixed(2),

    covered:
      vals.length
  };
}

function pairContinuity(
  currentIds,
  historicalIds
){
  if(
    currentIds.length<8 ||
    !historicalIds.length
  ){
    return null;
  }

  let pairTotal=0;
  let pairHits=0;

  for(
    let i=0;
    i<currentIds.length;
    i++
  ){
    for(
      let j=i+1;
      j<currentIds.length;
      j++
    ){
      pairTotal++;

      const a=currentIds[i];
      const b=currentIds[j];

      pairHits +=
        historicalIds.filter(
          x =>
            x.includes(a) &&
            x.includes(b)
        ).length /
        historicalIds.length;
    }
  }

  return pairTotal
    ? pairHits/pairTotal
    : null;
}

function confidenceCalibrate(
  p,
  q
){
  const reliability=
    .50 +
    .45*(q/100);

  return clamp(
    .5 +
    (p-.5)*reliability,
    .04,
    .96
  );
}

function dataQuality(o){
  let q=42;

  q += Math.min(
    15,
    (o.homeN+o.awayN)*.5
  );

  q += Math.min(
    9,
    (
      o.homeSplitN +
      o.awaySplitN
    )*.65
  );

  if(o.season) q+=7;
  if(o.table) q+=4;
  if(o.chance) q+=7;
  if(o.injuries) q+=3;
  if(o.lineupConfirmed) q+=8;
  if(o.playerStrength) q+=5;
  if(o.partnership) q+=3;

  q += o.leagueScore*3;

  return Math.round(
    clamp(
      q,
      50,
      98
    )
  );
}

async function squadPages(
  team,
  league,
  season,
  key
){
  const first=
    await api(
      `/players?team=${team}&league=${league}&season=${season}&page=1`,
      key,
      300000
    ).catch(
      () => null
    );

  if(!first){
    return [];
  }

  const out=[first];

  const total=
    num(
      first?.paging?.total,
      1
    );

  if(total>1){
    out.push(
      await api(
        `/players?team=${team}&league=${league}&season=${season}&page=2`,
        key,
        300000
      ).catch(
        () => null
      )
    );
  }

  return out.filter(Boolean);
}

module.exports =
async function handler(
  req,
  res
){
  if(req.method!=="POST"){
    return res.status(405).json({
      error:"Method not allowed"
    });
  }

  const key=
    process.env.API_FOOTBALL_KEY;

  if(!key){
    return res.status(500).json({
      error:
        "API_FOOTBALL_KEY missing"
    });
  }

  const b=req.body || {};

  const homeId=
    num(b.homeTeamId);

  const awayId=
    num(b.awayTeamId);

  const leagueId=
    num(b.leagueId);

  const fixtureId=
    num(b.fixtureId);

  const before=
    new Date(
      b.fixtureDate ||
      Date.now()
    );

  const season=
    num(
      b.season,
      seasonFor(before)
    );

  if(
    !homeId ||
    !awayId ||
    !fixtureId
  ){
    return res.status(400).json({
      error:
        "Missing fixture/team IDs"
    });
  }

  try{
    const [
      homeData,
      awayData
    ] =
      await Promise.all([
        api(
          `/fixtures?team=${homeId}&last=20`,
          key,
          120000
        ),

        api(
          `/fixtures?team=${awayId}&last=20`,
          key,
          120000
        )
      ]);

    const h20=
      recent(
        rows(homeData),
        homeId,
        before,
        20
      );

    const a20=
      recent(
        rows(awayData),
        awayId,
        before,
        20
      );

    const hHome=
      recent(
        rows(homeData),
        homeId,
        before,
        10,
        "home"
      );

    const aAway=
      recent(
        rows(awayData),
        awayId,
        before,
        10,
        "away"
      );

    if(
      h20.length<5 ||
      a20.length<5
    ){
      return res.status(422).json({
        error:
          "Not enough recent completed matches"
      });
    }

    const date=
      before
        .toISOString()
        .slice(0,10);

    const [
      hs,
      as,
      stand,
      injuriesData,
      lineupData,
      h2hData
    ] =
      await Promise.all([
        leagueId
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${homeId}&date=${date}`,
              key,
              300000
            ).catch(
              () => null
            )
          : null,

        leagueId
          ? api(
              `/teams/statistics?league=${leagueId}&season=${season}&team=${awayId}&date=${date}`,
              key,
              300000
            ).catch(
              () => null
            )
          : null,

        leagueId
          ? api(
              `/standings?league=${leagueId}&season=${season}`,
              key,
              300000
            ).catch(
              () => null
            )
          : null,

        api(
          `/injuries?fixture=${fixtureId}`,
          key,
          120000
        ).catch(
          () => null
        ),

        api(
          `/fixtures/lineups?fixture=${fixtureId}`,
          key,
          120000
        ).catch(
          () => null
        ),

        api(
          `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`,
          key,
          300000
        ).catch(
          () => null
        )
      ]);

    const hRecentIds=
      h20
        .slice(0,3)
        .map(
          x =>
            x.fixture.id
        );

    const aRecentIds=
      a20
        .slice(0,3)
        .map(
          x =>
            x.fixture.id
        );

    const statIds=
      [
        ...new Set([
          ...hRecentIds,
          ...aRecentIds
        ])
      ];

    const statResponses=
      await mapLimit(
        statIds,
        3,
        id =>
          api(
            `/fixtures/statistics?fixture=${id}`,
            key,
            300000
          )
      );

    const hChance=
      chanceProfile(
        statResponses,
        homeId
      );

    const aChance=
      chanceProfile(
        statResponses,
        awayId
      );

    const lineup=
      lineupInfo(
        lineupData
      );

    const homeLineup=
      lineupFor(
        lineup,
        homeId
      );

    const awayLineup=
      lineupFor(
        lineup,
        awayId
      );

    let hXi=null;
    let aXi=null;
    let hContinuity=null;
    let aContinuity=null;

    if(
      lineup.confirmed &&
      leagueId
    ){
      const [
        hp,
        ap,
        hHist,
        aHist
      ] =
        await Promise.all([
          squadPages(
            homeId,
            leagueId,
            season,
            key
          ),

          squadPages(
            awayId,
            leagueId,
            season,
            key
          ),

          mapLimit(
            hRecentIds,
            3,
            id =>
              api(
                `/fixtures/lineups?fixture=${id}`,
                key,
                300000
              )
          ),

          mapLimit(
            aRecentIds,
            3,
            id =>
              api(
                `/fixtures/lineups?fixture=${id}`,
                key,
                300000
              )
          )
        ]);

      const pmap=
        playerMap([
          ...hp,
          ...ap
        ]);

      const homeIds=
        xiIds(homeLineup);

      const awayIds=
        xiIds(awayLineup);

      hXi=
        xiStrength(
          homeIds,
          pmap
        );

      aXi=
        xiStrength(
          awayIds,
          pmap
        );

      const histIds=
        (
          arr,
          team
        ) =>
          arr
            .filter(Boolean)
            .map(
              d =>
                xiIds(
                  lineupFor(
                    lineupInfo(d),
                    team
                  )
                )
            )
            .filter(
              x =>
                x.length>=8
            );

      hContinuity=
        pairContinuity(
          homeIds,
          histIds(
            hHist,
            homeId
          )
        );

      aContinuity=
        pairContinuity(
          awayIds,
          histIds(
            aHist,
            awayId
          )
        );
    }

    const baselineVals=
      [
        seasonStat(
          hs,
          [
            "goals",
            "for",
            "average",
            "total"
          ],
          null
        ),

        seasonStat(
          as,
          [
            "goals",
            "for",
            "average",
            "total"
          ],
          null
        )
      ]
        .filter(
          Number.isFinite
        );

    const baseline=
      clamp(
        baselineVals.length
          ? baselineVals.reduce(
              (a,x) =>
                a+x,
              0
            ) /
            baselineVals.length
          : 1.35,
        .95,
        1.85
      );

    const hGF=
      weightedAvg(
        hHome,
        homeId,
        0
      ) ??
      weightedAvg(
        h20,
        homeId,
        0
      ) ??
      baseline;

    const hGA=
      weightedAvg(
        hHome,
        homeId,
        1
      ) ??
      weightedAvg(
        h20,
        homeId,
        1
      ) ??
      baseline;

    const aGF=
      weightedAvg(
        aAway,
        awayId,
        0
      ) ??
      weightedAvg(
        a20,
        awayId,
        0
      ) ??
      baseline;

    const aGA=
      weightedAvg(
        aAway,
        awayId,
        1
      ) ??
      weightedAvg(
        a20,
        awayId,
        1
      ) ??
      baseline;

    const hPlayed=
      seasonStat(
        hs,
        [
          "fixtures",
          "played",
          "home"
        ],
        0
      );

    const aPlayed=
      seasonStat(
        as,
        [
          "fixtures",
          "played",
          "away"
        ],
        0
      );

    const hsGF=
      seasonStat(
        hs,
        [
          "goals",
          "for",
          "average",
          "home"
        ],
        null
      );

    const hsGA=
      seasonStat(
        hs,
        [
          "goals",
          "against",
          "average",
          "home"
        ],
        null
      );

    const asGF=
      seasonStat(
        as,
        [
          "goals",
          "for",
          "average",
          "away"
        ],
        null
      );

    const asGA=
      seasonStat(
        as,
        [
          "goals",
          "against",
          "average",
          "away"
        ],
        null
      );

    let lh=
      .50 *
      shrink(
        hGF,
        hHome.length,
        baseline,
        7
      ) +
      .22 *
      shrink(
        hsGF,
        hPlayed,
        baseline,
        10
      ) +
      .28 *
      shrink(
        asGA,
        aPlayed,
        baseline,
        10
      );

    let la=
      .50 *
      shrink(
        aGF,
        aAway.length,
        baseline,
        7
      ) +
      .22 *
      shrink(
        asGF,
        aPlayed,
        baseline,
        10
      ) +
      .28 *
      shrink(
        hsGA,
        hPlayed,
        baseline,
        10
      );

    const dppg=
      ppg(
        h20,
        homeId
      ) -
      ppg(
        a20,
        awayId
      );

    lh *=
      clamp(
        1+dppg*.052,
        .88,
        1.13
      );

    la *=
      clamp(
        1-dppg*.047,
        .89,
        1.12
      );

    const homeStanding=
      standing(
        stand,
        homeId
      );

    const awayStanding=
      standing(
        stand,
        awayId
      );

    if(
      homeStanding &&
      awayStanding &&
      homeStanding.total>1
    ){
      const delta=
        (
          awayStanding.pos -
          homeStanding.pos
        ) /
        (
          homeStanding.total -
          1
        );

      const sample=
        Math.min(
          hPlayed+aPlayed,
          20
        ) /
        20;

      lh *=
        1 +
        delta*.09*sample;

      la *=
        1 -
        delta*.07*sample;
    }

    if(
      hChance &&
      aChance
    ){
      const chanceDelta=
        clamp(
          (
            hChance.pressure -
            aChance.pressure
          ) /
          8,
          -.12,
          .12
        );

      lh *=
        1 +
        chanceDelta*.32;

      la *=
        1 -
        chanceDelta*.28;
    }

    const injuries=
      rows(
        injuriesData
      );

    const hInj=
      injuries.filter(
        x =>
          x?.team?.id===homeId
      ).length;

    const aInj=
      injuries.filter(
        x =>
          x?.team?.id===awayId
      ).length;

    lh *=
      clamp(
        1 -
        (hInj-aInj)*.008,
        .94,
        1.05
      );

    la *=
      clamp(
        1 -
        (aInj-hInj)*.008,
        .94,
        1.05
      );

    if(
      lineup.confirmed &&
      hXi &&
      aXi
    ){
      const ratingDelta=
        clamp(
          (
            hXi.rating -
            aXi.rating
          ) /
          3,
          -.12,
          .12
        );

      const attackDelta=
        clamp(
          (
            hXi.attack -
            aXi.attack
          ) /
          8,
          -.10,
          .10
        );

      lh *=
        1 +
        ratingDelta*.20 +
        attackDelta*.18;

      la *=
        1 -
        ratingDelta*.17 -
        attackDelta*.14;

      if(
        hContinuity!==null &&
        aContinuity!==null
      ){
        const continuityDelta=
          clamp(
            hContinuity -
            aContinuity,
            -.25,
            .25
          );

        lh *=
          1 +
          continuityDelta*.08;

        la *=
          1 -
          continuityDelta*.06;
      }
    }

    lh *= 1.05;
    la *= .98;

    const h2h=
      rows(
        h2hData
      )
        .filter(done)
        .slice(0,5);

    if(h2h.length>=3){
      let hg=0;
      let ag=0;
      let n=0;

      for(
        const f of h2h
      ){
        const x=
          gfga(
            f,
            homeId
          );

        if(!x){
          continue;
        }

        hg += x[0];
        ag += x[1];
        n++;
      }

      if(n){
        lh =
          lh*.97 +
          (hg/n)*.03;

        la =
          la*.97 +
          (ag/n)*.03;
      }
    }

    lh=
      clamp(
        lh,
        .15,
        3.7
      );

    la=
      clamp(
        la,
        .13,
        3.5
      );

    let chanceLH=lh;
    let chanceLA=la;

    if(
      hChance &&
      aChance
    ){
      chanceLH=
        clamp(
          .65*lh +
          .35*(
            baseline *
            (
              .75 +
              hChance.pressure/5
            )
          ),
          .15,
          3.7
        );

      chanceLA=
        clamp(
          .65*la +
          .35*(
            baseline *
            (
              .75 +
              aChance.pressure/5
            )
          ),
          .13,
          3.5
        );
    }

    const finalLH=
      .72*lh +
      .28*chanceLH;

    const finalLA=
      .72*la +
      .28*chanceLA;

    const matrix=
      dixonColesMatrix(
        finalLH,
        finalLA
      );

    const goals=
      goalProbs(
        finalLH,
        finalLA
      );

    const home05=
      1 -
      Math.exp(-finalLH);

    const away05=
      1 -
      Math.exp(-finalLA);

    const btts=
      home05*away05;

    const league=
      LEAGUES[leagueId] || {
        score:.8,
        label:
          b.competition ||
          "Competition"
      };

    const quality=
      dataQuality({
        homeN:h20.length,
        awayN:a20.length,
        homeSplitN:hHome.length,
        awaySplitN:aAway.length,
        season:!!(hs&&as),
        table:!!(
          homeStanding &&
          awayStanding
        ),
        chance:!!(
          hChance &&
          aChance
        ),
        injuries:!!injuriesData,
        lineupConfirmed:
          lineup.confirmed,
        playerStrength:!!(
          hXi &&
          aXi
        ),
        partnership:
          hContinuity!==null &&
          aContinuity!==null,
        leagueScore:
          league.score
      });

    const makePrediction=
      (
        type,
        title,
        rule,
        raw,
        hit
      ) => ({
        id:
          `${fixtureId}|${rule}`,

        type,
        title,
        rule,

        p:
          Math.round(
            confidenceCalibrate(
              raw,
              quality
            ) *
            100
          ),

        rawP:
          Math.round(
            raw*100
          ),

        explanation:
          `V12 ensemble uses recent form, home/away splits, season attack/defence, opponent strength, Dixon-Coles score modelling, recent chance pressure, availability${lineup.confirmed ? ", confirmed starting XIs, player strength and XI continuity" : ""}. Expected goals ${finalLH.toFixed(2)}-${finalLA.toFixed(2)}.`,

        stats:{
          expectedHome:
            +finalLH.toFixed(2),

          expectedAway:
            +finalLA.toFixed(2),

          homePosition:
            homeStanding?.pos ??
            null,

          awayPosition:
            awayStanding?.pos ??
            null,

          dataConfidence:
            quality,

          last5HitRate:
            hit,

          homeForm:
            form(
              h20,
              homeId
            ),

          awayForm:
            form(
              a20,
              awayId
            ),

          h2hGames:
            h2h.length,

          homeSample:
            h20.length,

          awaySample:
            a20.length,

          homeVenueSample:
            hHome.length,

          awayVenueSample:
            aAway.length,

          lineupConfirmed:
            lineup.confirmed,

          homeXI:
            hXi?.rating ??
            null,

          awayXI:
            aXi?.rating ??
            null,

          homeContinuity:
            hContinuity===null
              ? null
              : Math.round(
                  hContinuity*100
                ),

          awayContinuity:
            aContinuity===null
              ? null
              : Math.round(
                  aContinuity*100
                ),

          homeChance:
            hChance?.pressure ??
            null,

          awayChance:
            aChance?.pressure ??
            null,

          homeSOT:
            hChance?.sot ??
            null,

          awaySOT:
            aChance?.sot ??
            null,

          homeInjuries:
            hInj,

          awayInjuries:
            aInj
        }
      });

    const predictions=[
      makePrediction(
        "teamgoal",
        `${b.homeTeam} over 0.5 goals`,
        "home0.5",
        home05,
        hitRate(
          h20,
          "team05",
          homeId
        )
      ),

      makePrediction(
        "teamgoal",
        `${b.awayTeam} over 0.5 goals`,
        "away0.5",
        away05,
        hitRate(
          a20,
          "team05",
          awayId
        )
      ),

      makePrediction(
        "goals",
        "Over 1.5 match goals",
        "over1.5",
        goals.over15,
        Math.round(
          (
            hitRate(
              h20,
              "over15",
              homeId
            ) +
            hitRate(
              a20,
              "over15",
              awayId
            )
          ) /
          2
        )
      ),

      makePrediction(
        "goals",
        "Over 2.5 match goals",
        "over2.5",
        goals.over25,
        Math.round(
          (
            hitRate(
              h20,
              "over25",
              homeId
            ) +
            hitRate(
              a20,
              "over25",
              awayId
            )
          ) /
          2
        )
      ),

      makePrediction(
        "goals",
        "Under 3.5 match goals",
        "under3.5",
        goals.under35,
        Math.round(
          (
            hitRate(
              h20,
              "under35",
              homeId
            ) +
            hitRate(
              a20,
              "under35",
              awayId
            )
          ) /
          2
        )
      ),

      makePrediction(
        "goals",
        "Under 4.5 match goals",
        "under4.5",
        goals.under45,
        Math.round(
          (
            hitRate(
              h20,
              "under45",
              homeId
            ) +
            hitRate(
              a20,
              "under45",
              awayId
            )
          ) /
          2
        )
      ),

      makePrediction(
        "btts",
        "Both teams to score",
        "btts",
        btts,
        Math.round(
          (
            hitRate(
              h20,
              "btts",
              homeId
            ) +
            hitRate(
              a20,
              "btts",
              awayId
            )
          ) /
          2
        )
      ),

      makePrediction(
        "double",
        `${b.homeTeam} or draw`,
        "homeOrDraw",
        matrix.home +
        matrix.draw,
        hitRate(
          h20,
          "nonloss",
          homeId
        )
      ),

      makePrediction(
        "double",
        `${b.awayTeam} or draw`,
        "awayOrDraw",
        matrix.away +
        matrix.draw,
        hitRate(
          a20,
          "nonloss",
          awayId
        )
      ),

      makePrediction(
        "result",
        `${b.homeTeam} win`,
        "homeWin",
        matrix.home,
        hitRate(
          h20,
          "win",
          homeId
        )
      ),

      makePrediction(
        "result",
        "Draw",
        "draw",
        matrix.draw,
        Math.round(
          (
            hitRate(
              h20,
              "draw",
              homeId
            ) +
            hitRate(
              a20,
              "draw",
              awayId
            )
          ) /
          2
        )
      ),

      makePrediction(
        "result",
        `${b.awayTeam} win`,
        "awayWin",
        matrix.away,
        hitRate(
          a20,
          "win",
          awayId
        )
      )
    ]
      .sort(
        (a,b) =>
          b.p-a.p
      );

    return res
      .status(200)
      .json({
        model:
          MODEL_VERSION,

        source:
          "API-Football",

        fixtureId,

        lineupConfirmed:
          lineup.confirmed,

        lineupChecked:
          true,

        evidence:{
          chanceStats:
            !!(
              hChance &&
              aChance
            ),

          playerStrength:
            !!(
              hXi &&
              aXi
            ),

          partnerships:
            hContinuity!==null &&
            aContinuity!==null
        },

        predictions
      });

  }catch(error){
    return res
      .status(502)
      .json({
        error:
          "Prediction model failed",

        detail:
          error?.message ||
          String(error)
      });
  }
};
