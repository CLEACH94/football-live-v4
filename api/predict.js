const API = "https://v3.football.api-sports.io";

const LEAGUES = {
  "premier league": { id: 39, score: 1.00, label: "Premier" },
  "championship": { id: 40, score: 0.86, label: "Championship" },
  "league one": { id: 41, score: 0.74, label: "League One" },
  "league two": { id: 42, score: 0.64, label: "League Two" },

  "fa cup": { id: 45, score: 0.78, label: "FA Cup" },
  "league cup": { id: 48, score: 0.78, label: "League Cup" },
  "efl cup": { id: 48, score: 0.78, label: "League Cup" },

  "champions league": { id: 2, score: 1.00, label: "Champions League" },
  "uefa champions league": { id: 2, score: 1.00, label: "Champions League" },

  "europa league": { id: 3, score: 0.92, label: "Europa League" },
  "uefa europa league": { id: 3, score: 0.92, label: "Europa League" },

  "conference league": { id: 848, score: 0.84, label: "Conference League" },
  "uefa conference league": { id: 848, score: 0.84, label: "Conference League" }
};

const cache = new Map();

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seasonFor(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  return month >= 7 ? year : year - 1;
}

function factorial(n) {
  let result = 1;

  for (let i = 2; i <= n; i++) {
    result *= i;
  }

  return result;
}

function poisson(k, lambda) {
  return (
    Math.exp(-lambda) *
    Math.pow(lambda, k) /
    factorial(k)
  );
}

function scoreMatrix(lambdaHome, lambdaAway) {
  let home = 0;
  let draw = 0;
  let away = 0;

  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p =
        poisson(h, lambdaHome) *
        poisson(a, lambdaAway);

      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }

  const total = home + draw + away;

  return {
    home: home / total,
    draw: draw / total,
    away: away / total
  };
}

async function api(path, key, ttl = 0) {
  const cacheKey = path;

  if (
    ttl &&
    cache.has(cacheKey) &&
    Date.now() - cache.get(cacheKey).time < ttl
  ) {
    return cache.get(cacheKey).data;
  }

  const response = await fetch(API + path, {
    headers: {
      "x-apisports-key": key
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `API-Football HTTP ${response.status}`
    );
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
      typeof data.errors === "string"
        ? data.errors
        : JSON.stringify(data.errors)
    );
  }

  if (ttl) {
    cache.set(cacheKey, {
      time: Date.now(),
      data
    });
  }

  return data;
}

function responseRows(data) {
  return Array.isArray(data?.response)
    ? data.response
    : [];
}

function teamName(fixture, side) {
  return fixture?.teams?.[side]?.name || "";
}

function fixtureDate(fixture) {
  return fixture?.fixture?.date || "";
}

function completed(fixture) {
  const status =
    fixture?.fixture?.status?.short || "";

  return [
    "FT",
    "AET",
    "PEN"
  ].includes(status);
}

function scores(fixture) {
  const home = fixture?.goals?.home;
  const away = fixture?.goals?.away;

  return [
    Number.isFinite(Number(home))
      ? Number(home)
      : null,

    Number.isFinite(Number(away))
      ? Number(away)
      : null
  ];
}

function gfga(fixture, teamId) {
  const [homeGoals, awayGoals] =
    scores(fixture);

  if (
    homeGoals === null ||
    awayGoals === null
  ) {
    return null;
  }

  const isHome =
    fixture?.teams?.home?.id === teamId;

  return isHome
    ? [homeGoals, awayGoals]
    : [awayGoals, homeGoals];
}

function lastFive(rows, teamId, before) {
  return rows
    .filter(completed)
    .filter(f =>
      f?.teams?.home?.id === teamId ||
      f?.teams?.away?.id === teamId
    )
    .filter(f =>
      new Date(fixtureDate(f)) < before
    )
    .sort(
      (a, b) =>
        new Date(fixtureDate(b)) -
        new Date(fixtureDate(a))
    )
    .slice(0, 5);
}

function weighted(rows, teamId, index) {
  const weights = [5, 4, 3, 2, 1];

  let numerator = 0;
  let denominator = 0;

  rows.forEach((fixture, i) => {
    const values = gfga(
      fixture,
      teamId
    );

    if (!values) return;

    numerator +=
      values[index] * weights[i];

    denominator += weights[i];
  });

  return denominator
    ? numerator / denominator
    : 0;
}

function form(rows, teamId) {
  return rows.map(fixture => {
    const values = gfga(
      fixture,
      teamId
    );

    if (!values) return "D";

    if (values[0] > values[1]) {
      return "W";
    }

    if (values[0] < values[1]) {
      return "L";
    }

    return "D";
  });
}

function rawHit(rows, rule, teamId) {
  if (!rows.length) return 0;

  let hits = 0;
  let valid = 0;

  rows.forEach(fixture => {
    const values =
      gfga(fixture, teamId);

    if (!values) return;

    valid++;

    const gf = values[0];
    const ga = values[1];
    const total = gf + ga;

    if (
      rule === "team05" &&
      gf >= 1
    ) {
      hits++;
    }

    if (
      rule === "over15" &&
      total >= 2
    ) {
      hits++;
    }

    if (
      rule === "over25" &&
      total >= 3
    ) {
      hits++;
    }

    if (
      rule === "btts" &&
      gf > 0 &&
      ga > 0
    ) {
      hits++;
    }

    if (
      rule === "nonloss" &&
      gf >= ga
    ) {
      hits++;
    }

    if (
      rule === "win" &&
      gf > ga
    ) {
      hits++;
    }
  });

  return valid
    ? Math.round(
        (hits / valid) * 100
      )
    : 0;
}

function calibrated(p, confidence) {
  const shrink =
    0.45 +
    0.45 *
      (confidence / 100);

  return clamp(
    0.5 +
      (p - 0.5) * shrink,
    0.05,
    0.95
  );
}

async function findTeam(
  name,
  key,
  suppliedId = null
) {
  if (
    suppliedId &&
    Number.isFinite(
      Number(suppliedId)
    )
  ) {
    return {
      id: Number(suppliedId),
      name
    };
  }

  const data = await api(
    `/teams?search=${encodeURIComponent(
      name
    )}`,
    key,
    300000
  );

  const rows = responseRows(data);

  if (!rows.length) {
    throw new Error(
      `Team not found: ${name}`
    );
  }

  const exact = rows.find(row =>
    norm(row?.team?.name) ===
    norm(name)
  );

  const chosen =
    exact || rows[0];

  return {
    id: chosen.team.id,
    name: chosen.team.name
  };
}

function findStanding(
  standingsData,
  teamId
) {
  const league =
    standingsData?.response?.[0]
      ?.league;

  const tables =
    league?.standings || [];

  const table =
    tables.flat();

  const row = table.find(
    x => x?.team?.id === teamId
  );

  if (!row) return null;

  const position =
    Number(row.rank);

  const count =
    table.length;

  return {
    pos: position,

    percentile:
      Number.isFinite(position) &&
      count > 1
        ? 1 -
          (position - 1) /
            (count - 1)
        : 0.5
  };
}

async function getH2H(
  homeId,
  awayId,
  key
) {
  try {
    const data = await api(
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`,
      key,
      300000
    );

    return responseRows(data)
      .filter(completed)
      .slice(0, 5);

  } catch {
    return [];
  }
}

module.exports =
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const key =
    process.env.API_FOOTBALL_KEY;

  if (!key) {
    return res.status(500).json({
      error:
        "API_FOOTBALL_KEY missing"
    });
  }

  const {
    homeTeam,
    awayTeam,
    competition,
    fixtureDate: requestedDate,
    homeTeamId,
    awayTeamId,
    leagueId,
    season
  } = req.body || {};

  if (
    !homeTeam ||
    !awayTeam
  ) {
    return res.status(400).json({
      error:
        "Missing fixture fields"
    });
  }

  try {
    const before =
      new Date(
        requestedDate ||
        Date.now()
      );

    const seasonYear =
      Number(season) ||
      seasonFor(before);

    const leagueInfo =
      LEAGUES[norm(competition)] ||
      null;

    const resolvedLeagueId =
      Number(leagueId) ||
      leagueInfo?.id ||
      null;

    const [
      home,
      away
    ] = await Promise.all([
      findTeam(
        homeTeam,
        key,
        homeTeamId
      ),

      findTeam(
        awayTeam,
        key,
        awayTeamId
      )
    ]);

    const [
      homeData,
      awayData
    ] = await Promise.all([
      api(
        `/fixtures?team=${home.id}&last=10`,
        key,
        120000
      ),

      api(
        `/fixtures?team=${away.id}&last=10`,
        key,
        120000
      )
    ]);

    const homeAll =
      responseRows(homeData);

    const awayAll =
      responseRows(awayData);

    const home5 =
      lastFive(
        homeAll,
        home.id,
        before
      );

    const away5 =
      lastFive(
        awayAll,
        away.id,
        before
      );

    if (
      home5.length < 3 ||
      away5.length < 3
    ) {
      return res
        .status(422)
        .json({
          error:
            "Not enough recent completed matches"
        });
    }

    let homeStanding = null;
    let awayStanding = null;

    if (resolvedLeagueId) {
      try {
        const standings =
          await api(
            `/standings?league=${resolvedLeagueId}&season=${seasonYear}`,
            key,
            300000
          );

        homeStanding =
          findStanding(
            standings,
            home.id
          );

        awayStanding =
          findStanding(
            standings,
            away.id
          );

      } catch {
        // Standings aren't available
        // for every cup/competition.
      }
    }

    const h2h =
      await getH2H(
        home.id,
        away.id,
        key
      );

    const hGF =
      weighted(
        home5,
        home.id,
        0
      );

    const hGA =
      weighted(
        home5,
        home.id,
        1
      );

    const aGF =
      weighted(
        away5,
        away.id,
        0
      );

    const aGA =
      weighted(
        away5,
        away.id,
        1
      );

    const tableDelta =
      homeStanding &&
      awayStanding
        ? homeStanding.percentile -
          awayStanding.percentile
        : 0;

    const tierScore =
      leagueInfo?.score || 0.78;

    const baseHome =
      hGF * 0.58 +
      aGA * 0.42;

    const baseAway =
      aGF * 0.58 +
      hGA * 0.42;

    const expectedHome =
      clamp(
        baseHome *
          1.08 *
          (
            1 +
            tableDelta * 0.20
          ),
        0.15,
        3.8
      );

    const expectedAway =
      clamp(
        baseAway *
          (1 / 1.08) *
          (
            1 -
            tableDelta * 0.20
          ),
        0.12,
        3.5
      );

    const totalExpected =
      expectedHome +
      expectedAway;

    const matrix =
      scoreMatrix(
        expectedHome,
        expectedAway
      );

    const probabilities = {
      home05:
        1 -
        Math.exp(-expectedHome),

      away05:
        1 -
        Math.exp(-expectedAway),

      over15:
        1 -
        Math.exp(
          -totalExpected
        ) *
        (
          1 +
          totalExpected
        ),

      over25:
        1 -
        Math.exp(
          -totalExpected
        ) *
        (
          1 +
          totalExpected +
          (
            totalExpected *
            totalExpected
          ) / 2
        ),

      btts:
        (
          1 -
          Math.exp(
            -expectedHome
          )
        ) *
        (
          1 -
          Math.exp(
            -expectedAway
          )
        ),

      homeWin:
        matrix.home,

      awayWin:
        matrix.away,

      homeOrDraw:
        matrix.home +
        matrix.draw,

      awayOrDraw:
        matrix.away +
        matrix.draw
    };

    const dataConfidence =
      Math.round(
        clamp(
          60 +
          (
            home5.length +
            away5.length
          ) * 2 +
          (
            homeStanding &&
            awayStanding
              ? 12
              : 0
          ) +
          (
            h2h.length
              ? 8
              : 0
          ) +
          tierScore * 5,
          55,
          96
        )
      );

    const makePrediction =
      (
        type,
        title,
        rule,
        probability,
        last5HitRate
      ) => ({
        id:
          `${home.name}|${away.name}|${rule}`,

        type,
        title,
        rule,

        p:
          Math.round(
            calibrated(
              probability,
              dataConfidence
            ) * 100
          ),

        explanation:
          `Expected goals ${expectedHome.toFixed(
            2
          )}-${expectedAway.toFixed(
            2
          )}. Recent attack and defence are adjusted for opponent strength, home advantage and table position where available.`,

        stats: {
          expectedHome:
            Number(
              expectedHome.toFixed(2)
            ),

          expectedAway:
            Number(
              expectedAway.toFixed(2)
            ),

          homePosition:
            homeStanding?.pos ??
            null,

          awayPosition:
            awayStanding?.pos ??
            null,

          homeTierLabel:
            leagueInfo?.label ||
            competition ||
            "Other",

          awayTierLabel:
            leagueInfo?.label ||
            competition ||
            "Other",

          h2hGames:
            h2h.length,

          dataConfidence,

          last5HitRate,

          homeForm:
            form(
              home5,
              home.id
            ),

          awayForm:
            form(
              away5,
              away.id
            )
        }
      });

    const predictions = [
      makePrediction(
        "teamgoal",
        `${home.name} over 0.5 goals`,
        "home0.5",
        probabilities.home05,
        rawHit(
          home5,
          "team05",
          home.id
        )
      ),

      makePrediction(
        "teamgoal",
        `${away.name} over 0.5 goals`,
        "away0.5",
        probabilities.away05,
        rawHit(
          away5,
          "team05",
          away.id
        )
      ),

      makePrediction(
        "goals",
        "Over 1.5 match goals",
        "over1.5",
        probabilities.over15,
        Math.round(
          (
            rawHit(
              home5,
              "over15",
              home.id
            ) +
            rawHit(
              away5,
              "over15",
              away.id
            )
          ) / 2
        )
      ),

      makePrediction(
        "goals",
        "Over 2.5 match goals",
        "over2.5",
        probabilities.over25,
        Math.round(
          (
            rawHit(
              home5,
              "over25",
              home.id
            ) +
            rawHit(
              away5,
              "over25",
              away.id
            )
          ) / 2
        )
      ),

      makePrediction(
        "btts",
        "Both teams to score",
        "btts",
        probabilities.btts,
        Math.round(
          (
            rawHit(
              home5,
              "btts",
              home.id
            ) +
            rawHit(
              away5,
              "btts",
              away.id
            )
          ) / 2
        )
      ),

      makePrediction(
        "double",
        `${home.name} or draw`,
        "homeOrDraw",
        probabilities.homeOrDraw,
        rawHit(
          home5,
          "nonloss",
          home.id
        )
      ),

      makePrediction(
        "double",
        `${away.name} or draw`,
        "awayOrDraw",
        probabilities.awayOrDraw,
        rawHit(
          away5,
          "nonloss",
          away.id
        )
      ),

      makePrediction(
        "result",
        `${home.name} win`,
        "homeWin",
        probabilities.homeWin,
        rawHit(
          home5,
          "win",
          home.id
        )
      ),

      makePrediction(
        "result",
        `${away.name} win`,
        "awayWin",
        probabilities.awayWin,
        rawHit(
          away5,
          "win",
          away.id
        )
      )
    ]
      .filter(x => x.p >= 50)
      .sort(
        (a, b) =>
          b.p - a.p
      );

    return res
      .status(200)
      .json({
        model:
          "v9-api-football-strength-calibrated",

        source:
          "API-Football",

        teams: {
          home: {
            id: home.id,
            name: home.name
          },

          away: {
            id: away.id,
            name: away.name
          }
        },

        predictions
      });

  } catch (error) {
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
