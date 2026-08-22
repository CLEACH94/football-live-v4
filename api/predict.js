const API = "https://v3.football.api-sports.io";
const MODEL_VERSION = "v11-strength-calibrated";

const LEAGUES = {
  39: { score: 1.0, label: "Premier League" },
  40: { score: 0.9, label: "Championship" },
  41: { score: 0.82, label: "League One" },
  42: { score: 0.76, label: "League Two" },
  45: { score: 0.82, label: "FA Cup" },
  48: { score: 0.82, label: "League Cup" },
  2: { score: 1.0, label: "Champions League" },
  3: { score: 0.94, label: "Europa League" },
  848: { score: 0.88, label: "Conference League" }
};

const cache = new Map();

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function seasonFor(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  return d.getUTCMonth() + 1 >= 7 ? y : y - 1;
}

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poisson(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function scoreMatrix(lh, la) {
  let home = 0;
  let draw = 0;
  let away = 0;
  let total = 0;

  for (let h = 0; h <= 9; h++) {
    for (let a = 0; a <= 9; a++) {
      const p = poisson(h, lh) * poisson(a, la);
      total += p;

      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }

  return {
    home: home / total,
    draw: draw / total,
    away: away / total
  };
}

async function api(path, key, ttl = 0) {
  if (
    ttl &&
    cache.has(path) &&
    Date.now() - cache.get(path).time < ttl
  ) {
    return cache.get(path).data;
  }

  const response = await fetch(API + path, {
    headers: {
      "x-apisports-key": key
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API-Football HTTP ${response.status}`);
  }

  if (
    data?.errors &&
    (
      Array.isArray(data.errors)
        ? data.errors.length
        : Object.keys(data.errors).length
    )
  ) {
    throw new Error(
      Array.isArray(data.errors)
        ? data.errors.join(", ")
        : JSON.stringify(data.errors)
    );
  }

  if (ttl) {
    cache.set(path, {
      time: Date.now(),
      data
    });
  }

  return data;
}

function rows(data) {
  return Array.isArray(data?.response)
    ? data.response
    : [];
}

function done(fixture) {
  return ["FT", "AET", "PEN"].includes(
    fixture?.fixture?.status?.short || ""
  );
}

function beforeDate(fixture, before) {
  return new Date(
    fixture?.fixture?.date || 0
  ) < before;
}

function teamSide(fixture, id) {
  if (fixture?.teams?.home?.id === id) return "home";
  if (fixture?.teams?.away?.id === id) return "away";
  return null;
}

function gfga(fixture, id) {
  const side = teamSide(fixture, id);

  if (!side) return null;

  const h = num(fixture?.goals?.home);
  const a = num(fixture?.goals?.away);

  if (h === null || a === null) return null;

  return side === "home"
    ? [h, a]
    : [a, h];
}

function recentMatches(
  all,
  id,
  before,
  limit = 20,
  side = null
) {
  return all
    .filter(done)
    .filter(f => beforeDate(f, before))
    .filter(f => teamSide(f, id))
    .filter(f => !side || teamSide(f, id) === side)
    .sort(
      (a, b) =>
        new Date(b.fixture.date) -
        new Date(a.fixture.date)
    )
    .slice(0, limit);
}

function weightedAverage(list, id, index) {
  if (!list.length) return null;

  let numerator = 0;
  let denominator = 0;

  list.forEach((fixture, i) => {
    const values = gfga(fixture, id);

    if (!values) return;

    const weight = Math.pow(0.9, i);

    numerator += values[index] * weight;
    denominator += weight;
  });

  return denominator
    ? numerator / denominator
    : null;
}

function ppg(list, id) {
  if (!list.length) return 1.35;

  let numerator = 0;
  let denominator = 0;

  list.forEach((fixture, i) => {
    const values = gfga(fixture, id);

    if (!values) return;

    const points =
      values[0] > values[1]
        ? 3
        : values[0] === values[1]
        ? 1
        : 0;

    const weight = Math.pow(0.92, i);

    numerator += points * weight;
    denominator += weight;
  });

  return denominator
    ? numerator / denominator
    : 1.35;
}

function form(list, id) {
  return list
    .slice(0, 5)
    .map(fixture => {
      const values = gfga(fixture, id);

      if (!values) return "D";

      if (values[0] > values[1]) return "W";
      if (values[0] < values[1]) return "L";

      return "D";
    });
}

function hitRate(list, rule, id) {
  let hit = 0;
  let valid = 0;

  for (const fixture of list.slice(0, 10)) {
    const values = gfga(fixture, id);

    if (!values) continue;

    valid++;

    const gf = values[0];
    const ga = values[1];
    const total = gf + ga;

    if (rule === "team05" && gf >= 1) hit++;
    if (rule === "over15" && total >= 2) hit++;
    if (rule === "over25" && total >= 3) hit++;
    if (rule === "under35" && total <= 3) hit++;
    if (rule === "under45" && total <= 4) hit++;
    if (rule === "btts" && gf > 0 && ga > 0) hit++;
    if (rule === "nonloss" && gf >= ga) hit++;
    if (rule === "win" && gf > ga) hit++;
    if (rule === "draw" && gf === ga) hit++;
  }

  return valid
    ? Math.round((hit / valid) * 100)
    : 0;
}

function seasonAvg(stats, path, fallback) {
  try {
    let current = stats?.response;

    for (const part of path) {
      current = current?.[part];
    }

    return num(current, fallback);
  } catch {
    return fallback;
  }
}

function standing(data, teamId) {
  const tables =
    data?.response?.[0]
      ?.league
      ?.standings || [];

  const flat = tables.flat();

  const row = flat.find(
    x => x?.team?.id === teamId
  );

  if (!row) return null;

  return {
    pos: num(row.rank),
    total: flat.length,
    points: num(row.points),
    gd: num(row.goalsDiff, 0)
  };
}

function shrink(
  observed,
  sample,
  baseline,
  strength = 8
) {
  if (!Number.isFinite(observed)) {
    return baseline;
  }

  const weight =
    sample / (sample + strength);

  return (
    observed * weight +
    baseline * (1 - weight)
  );
}

function goalDistribution(lh, la) {
  const total = lh + la;

  const over15 =
    1 -
    Math.exp(-total) *
      (1 + total);

  const over25 =
    1 -
    Math.exp(-total) *
      (
        1 +
        total +
        total * total / 2
      );

  const under35 =
    Math.exp(-total) *
    (
      1 +
      total +
      total ** 2 / 2 +
      total ** 3 / 6
    );

  const under45 =
    under35 +
    Math.exp(-total) *
      total ** 4 / 24;

  return {
    over15,
    over25,
    under35,
    under45
  };
}

function dataConfidence({
  homeN,
  awayN,
  homeSplitN,
  awaySplitN,
  hasSeason,
  hasTable,
  h2hN,
  leagueScore
}) {
  let confidence = 45;

  confidence += Math.min(
    18,
    (homeN + awayN) * 0.65
  );

  confidence += Math.min(
    10,
    (homeSplitN + awaySplitN) * 0.8
  );

  if (hasSeason) confidence += 10;
  if (hasTable) confidence += 5;
  if (h2hN >= 3) confidence += 3;

  confidence += leagueScore * 4;

  return Math.round(
    clamp(confidence, 50, 96)
  );
}

function confidenceCalibrate(
  probability,
  confidence
) {
  const reliability =
    0.52 +
    0.43 * (confidence / 100);

  return clamp(
    0.5 +
      (probability - 0.5) *
        reliability,
    0.04,
    0.96
  );
}

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const key =
    process.env.API_FOOTBALL_KEY;

  if (!key) {
    return res.status(500).json({
      error: "API_FOOTBALL_KEY missing"
    });
  }

  const body = req.body || {};

  const homeId = num(body.homeTeamId);
  const awayId = num(body.awayTeamId);
  const leagueId = num(body.leagueId);

  const before = new Date(
    body.fixtureDate || Date.now()
  );

  const season = num(
    body.season,
    seasonFor(before)
  );

  if (
    !homeId ||
    !awayId ||
    !body.homeTeam ||
    !body.awayTeam
  ) {
    return res.status(400).json({
      error: "Missing fixture/team IDs"
    });
  }

  try {
    const [
      homeRecentData,
      awayRecentData
    ] = await Promise.all([
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

    const homeAll =
      rows(homeRecentData);

    const awayAll =
      rows(awayRecentData);

    const home20 =
      recentMatches(
        homeAll,
        homeId,
        before,
        20
      );

    const away20 =
      recentMatches(
        awayAll,
        awayId,
        before,
        20
      );

    const homeHome =
      recentMatches(
        homeAll,
        homeId,
        before,
        10,
        "home"
      );

    const awayAway =
      recentMatches(
        awayAll,
        awayId,
        before,
        10,
        "away"
      );

    if (
      home20.length < 5 ||
      away20.length < 5
    ) {
      return res.status(422).json({
        error:
          "Not enough recent completed matches"
      });
    }

    let homeStats = null;
    let awayStats = null;
    let standings = null;
    let h2h = [];

    if (leagueId) {
      const date =
        before
          .toISOString()
          .slice(0, 10);

      const [
        hs,
        as,
        st,
        hh
      ] = await Promise.all([
        api(
          `/teams/statistics?league=${leagueId}&season=${season}&team=${homeId}&date=${date}`,
          key,
          300000
        ).catch(() => null),

        api(
          `/teams/statistics?league=${leagueId}&season=${season}&team=${awayId}&date=${date}`,
          key,
          300000
        ).catch(() => null),

        api(
          `/standings?league=${leagueId}&season=${season}`,
          key,
          300000
        ).catch(() => null),

        api(
          `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`,
          key,
          300000
        ).catch(() => null)
      ]);

      homeStats = hs;
      awayStats = as;
      standings = st;

      h2h =
        rows(hh)
          .filter(done)
          .slice(0, 5);
    }

    const hGF20 =
      weightedAverage(
        home20,
        homeId,
        0
      ) ?? 1.25;

    const hGA20 =
      weightedAverage(
        home20,
        homeId,
        1
      ) ?? 1.25;

    const aGF20 =
      weightedAverage(
        away20,
        awayId,
        0
      ) ?? 1.25;

    const aGA20 =
      weightedAverage(
        away20,
        awayId,
        1
      ) ?? 1.25;

    const hGFhome =
      weightedAverage(
        homeHome,
        homeId,
        0
      );

    const hGAhome =
      weightedAverage(
        homeHome,
        homeId,
        1
      );

    const aGFaway =
      weightedAverage(
        awayAway,
        awayId,
        0
      );

    const aGAaway =
      weightedAverage(
        awayAway,
        awayId,
        1
      );

    const hsPlayedHome =
      seasonAvg(
        homeStats,
        ["fixtures", "played", "home"],
        0
      );

    const asPlayedAway =
      seasonAvg(
        awayStats,
        ["fixtures", "played", "away"],
        0
      );

    const hsGFhome =
      seasonAvg(
        homeStats,
        [
          "goals",
          "for",
          "average",
          "home"
        ],
        null
      );

    const hsGAhome =
      seasonAvg(
        homeStats,
        [
          "goals",
          "against",
          "average",
          "home"
        ],
        null
      );

    const asGFaway =
      seasonAvg(
        awayStats,
        [
          "goals",
          "for",
          "average",
          "away"
        ],
        null
      );

    const asGAaway =
      seasonAvg(
        awayStats,
        [
          "goals",
          "against",
          "average",
          "away"
        ],
        null
      );

    const hSeasonTotalGF =
      seasonAvg(
        homeStats,
        [
          "goals",
          "for",
          "average",
          "total"
        ],
        null
      );

    const aSeasonTotalGF =
      seasonAvg(
        awayStats,
        [
          "goals",
          "for",
          "average",
          "total"
        ],
        null
      );

    const availableBaseline =
      [
        hSeasonTotalGF,
        aSeasonTotalGF
      ].filter(Number.isFinite);

    const leagueBaseline =
      clamp(
        availableBaseline.length
          ? availableBaseline.reduce(
              (a, b) => a + b,
              0
            ) /
              availableBaseline.length
          : 1.35,
        0.95,
        1.85
      );

    const recentHomeAttack =
      shrink(
        hGFhome ?? hGF20,
        homeHome.length,
        leagueBaseline,
        7
      );

    const recentHomeDef =
      shrink(
        hGAhome ?? hGA20,
        homeHome.length,
        leagueBaseline,
        7
      );

    const recentAwayAttack =
      shrink(
        aGFaway ?? aGF20,
        awayAway.length,
        leagueBaseline,
        7
      );

    const recentAwayDef =
      shrink(
        aGAaway ?? aGA20,
        awayAway.length,
        leagueBaseline,
        7
      );

    const seasonHomeAttack =
      shrink(
        hsGFhome ??
          recentHomeAttack,
        hsPlayedHome,
        leagueBaseline,
        10
      );

    const seasonHomeDef =
      shrink(
        hsGAhome ??
          recentHomeDef,
        hsPlayedHome,
        leagueBaseline,
        10
      );

    const seasonAwayAttack =
      shrink(
        asGFaway ??
          recentAwayAttack,
        asPlayedAway,
        leagueBaseline,
        10
      );

    const seasonAwayDef =
      shrink(
        asGAaway ??
          recentAwayDef,
        asPlayedAway,
        leagueBaseline,
        10
      );

    let expHome =
      0.52 * recentHomeAttack +
      0.23 * seasonHomeAttack +
      0.25 * seasonAwayDef;

    let expAway =
      0.52 * recentAwayAttack +
      0.23 * seasonAwayAttack +
      0.25 * seasonHomeDef;

    const hPpg =
      ppg(home20, homeId);

    const aPpg =
      ppg(away20, awayId);

    expHome *= clamp(
      1 +
        (hPpg - aPpg) * 0.055,
      0.88,
      1.13
    );

    expAway *= clamp(
      1 +
        (aPpg - hPpg) * 0.05,
      0.89,
      1.12
    );

    const homeStanding =
      standing(
        standings,
        homeId
      );

    const awayStanding =
      standing(
        standings,
        awayId
      );

    if (
      homeStanding &&
      awayStanding &&
      homeStanding.total > 1
    ) {
      const tableDelta =
        (
          awayStanding.pos -
          homeStanding.pos
        ) /
        (
          homeStanding.total -
          1
        );

      const seasonSample =
        Math.min(
          hsPlayedHome +
            asPlayedAway,
          20
        ) / 20;

      expHome *=
        1 +
        tableDelta *
          0.1 *
          seasonSample;

      expAway *=
        1 -
        tableDelta *
          0.08 *
          seasonSample;
    }

    expHome *= 1.055;
    expAway *= 0.975;

    if (h2h.length >= 3) {
      let h2hHomeGF = 0;
      let h2hAwayGF = 0;
      let count = 0;

      for (const fixture of h2h) {
        const hg =
          num(
            fixture?.goals?.home
          );

        const ag =
          num(
            fixture?.goals?.away
          );

        if (
          hg === null ||
          ag === null
        ) {
          continue;
        }

        if (
          fixture?.teams
            ?.home?.id ===
          homeId
        ) {
          h2hHomeGF += hg;
          h2hAwayGF += ag;
        } else {
          h2hHomeGF += ag;
          h2hAwayGF += hg;
        }

        count++;
      }

      if (count) {
        expHome =
          expHome * 0.96 +
          (
            h2hHomeGF /
            count
          ) * 0.04;

        expAway =
          expAway * 0.96 +
          (
            h2hAwayGF /
            count
          ) * 0.04;
      }
    }

    expHome =
      clamp(
        expHome,
        0.18,
        3.6
      );

    expAway =
      clamp(
        expAway,
        0.15,
        3.4
      );

    const matrix =
      scoreMatrix(
        expHome,
        expAway
      );

    const goals =
      goalDistribution(
        expHome,
        expAway
      );

    const home05 =
      1 -
      Math.exp(-expHome);

    const away05 =
      1 -
      Math.exp(-expAway);

    const btts =
      home05 * away05;

    const leagueInfo =
      LEAGUES[leagueId] || {
        score: 0.8,
        label:
          body.competition ||
          "Competition"
      };

    const confidence =
      dataConfidence({
        homeN:
          home20.length,

        awayN:
          away20.length,

        homeSplitN:
          homeHome.length,

        awaySplitN:
          awayAway.length,

        hasSeason:
          !!(
            homeStats &&
            awayStats
          ),

        hasTable:
          !!(
            homeStanding &&
            awayStanding
          ),

        h2hN:
          h2h.length,

        leagueScore:
          leagueInfo.score
      });

    const makePrediction = (
      type,
      title,
      rule,
      rawProbability,
      hit
    ) => {
      const calibrated =
        confidenceCalibrate(
          rawProbability,
          confidence
        );

      return {
        id:
          `${
            body.fixtureId ||
            "fixture"
          }|${rule}`,

        type,
        title,
        rule,

        p:
          Math.round(
            calibrated * 100
          ),

        rawP:
          Math.round(
            rawProbability * 100
          ),

        explanation:
          `Built from last-20 recency-weighted form, home/away splits, current-season attack/defence rates, opponent strength, home advantage and small table/H2H adjustments. Expected goals ${expHome.toFixed(
            2
          )}–${expAway.toFixed(
            2
          )}.`,

        stats: {
          expectedHome:
            Number(
              expHome.toFixed(2)
            ),

          expectedAway:
            Number(
              expAway.toFixed(2)
            ),

          homePosition:
            homeStanding?.pos ??
            null,

          awayPosition:
            awayStanding?.pos ??
            null,

          homeTierLabel:
            leagueInfo.label,

          awayTierLabel:
            leagueInfo.label,

          h2hGames:
            h2h.length,

          dataConfidence:
            confidence,

          last5HitRate:
            hit,

          homeForm:
            form(
              home20,
              homeId
            ),

          awayForm:
            form(
              away20,
              awayId
            ),

          homeSample:
            home20.length,

          awaySample:
            away20.length,

          homeVenueSample:
            homeHome.length,

          awayVenueSample:
            awayAway.length
        }
      };
    };

    const predictions = [
      makePrediction(
        "teamgoal",
        `${body.homeTeam} over 0.5 goals`,
        "home0.5",
        home05,
        hitRate(
          home20,
          "team05",
          homeId
        )
      ),

      makePrediction(
        "teamgoal",
        `${body.awayTeam} over 0.5 goals`,
        "away0.5",
        away05,
        hitRate(
          away20,
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
              home20,
              "over15",
              homeId
            ) +
            hitRate(
              away20,
              "over15",
              awayId
            )
          ) / 2
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
              home20,
              "over25",
              homeId
            ) +
            hitRate(
              away20,
              "over25",
              awayId
            )
          ) / 2
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
              home20,
              "under35",
              homeId
            ) +
            hitRate(
              away20,
              "under35",
              awayId
            )
          ) / 2
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
              home20,
              "under45",
              homeId
            ) +
            hitRate(
              away20,
              "under45",
              awayId
            )
          ) / 2
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
              home20,
              "btts",
              homeId
            ) +
            hitRate(
              away20,
              "btts",
              awayId
            )
          ) / 2
        )
      ),

      makePrediction(
        "double",
        `${body.homeTeam} or draw`,
        "homeOrDraw",
        matrix.home +
          matrix.draw,
        hitRate(
          home20,
          "nonloss",
          homeId
        )
      ),

      makePrediction(
        "double",
        `${body.awayTeam} or draw`,
        "awayOrDraw",
        matrix.away +
          matrix.draw,
        hitRate(
          away20,
          "nonloss",
          awayId
        )
      ),

      makePrediction(
        "result",
        `${body.homeTeam} win`,
        "homeWin",
        matrix.home,
        hitRate(
          home20,
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
              home20,
              "draw",
              homeId
            ) +
            hitRate(
              away20,
              "draw",
              awayId
            )
          ) / 2
        )
      ),

      makePrediction(
        "result",
        `${body.awayTeam} win`,
        "awayWin",
        matrix.away,
        hitRate(
          away20,
          "win",
          awayId
        )
      )
    ].sort(
      (a, b) =>
        b.p - a.p
    );

    return res.status(200).json({
      model:
        MODEL_VERSION,

      source:
        "API-Football",

      fixtureId:
        body.fixtureId ||
        null,

      predictions
    });

  } catch (error) {
    return res.status(502).json({
      error:
        "Prediction model failed",

      detail:
        error?.message ||
        String(error)
    });
  }
};
