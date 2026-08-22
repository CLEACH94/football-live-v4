const CORDAX = "https://api.cordax.net";

const ENGLISH_TIER = {
  "premier league": { score: 1.00, label: "Premier" },
  "championship": { score: 0.86, label: "Championship" },
  "league one": { score: 0.74, label: "League One" },
  "league two": { score: 0.64, label: "League Two" },
  "national league": { score: 0.55, label: "National" }
};

const cache = new Map();

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function arrify(d) {
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== "object") return [];

  for (const k of [
    "data",
    "items",
    "results",
    "fixtures",
    "value"
  ]) {
    if (Array.isArray(d[k])) return d[k];
  }

  return [];
}

function pick(o, keys, fallback = null) {
  if (!o || typeof o !== "object") return fallback;

  for (const k of keys) {
    if (
      o[k] !== undefined &&
      o[k] !== null &&
      o[k] !== ""
    ) {
      return o[k];
    }
  }

  return fallback;
}

function homeOf(f) {
  return pick(
    f,
    ["HomeTeam", "HOME_TEAM", "homeTeam"],
    pick(f.Home, ["Team"], "")
  );
}

function awayOf(f) {
  return pick(
    f,
    ["AwayTeam", "AWAY_TEAM", "awayTeam"],
    pick(f.Away, ["Team"], "")
  );
}

function compOf(f) {
  return pick(
    f,
    ["Competition", "COMPETITION", "competition"],
    ""
  );
}

function dateOf(f) {
  return pick(
    f,
    [
      "FixtureDate",
      "MATCH_DATE",
      "matchDate",
      "date",
      "utcDate"
    ],
    ""
  );
}

function statusOf(f) {
  return String(
    pick(
      f,
      ["MatchStatus", "MATCH_STATUS", "status"],
      ""
    )
  );
}

function scorePair(f) {
  let h = pick(
    f,
    ["HomeScore", "HOME_SCORE", "homeScore"],
    null
  );

  let a = pick(
    f,
    ["AwayScore", "AWAY_SCORE", "awayScore"],
    null
  );

  if (h === null && f.Home) {
    h = pick(f.Home, ["Goals"], null);
  }

  if (a === null && f.Away) {
    a = pick(f.Away, ["Goals"], null);
  }

  return [
    h === null ? null : Number(h),
    a === null ? null : Number(a)
  ];
}

function done(f) {
  return /ft|finished|pens|aet/i.test(statusOf(f));
}

function gfga(f, team) {
  const [h, a] = scorePair(f);

  if (!Number.isFinite(h) || !Number.isFinite(a)) {
    return null;
  }

  return homeOf(f) === team
    ? [h, a]
    : [a, h];
}

function factorial(n) {
  let x = 1;

  for (let i = 2; i <= n; i++) {
    x *= i;
  }

  return x;
}

function poisson(k, lambda) {
  return (
    Math.exp(-lambda) *
    Math.pow(lambda, k) /
    factorial(k)
  );
}

function seasonFor(d) {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  return month >= 7
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

async function cordax(path, token, ttl = 0) {
  if (
    ttl &&
    cache.has(path) &&
    Date.now() - cache.get(path).ts < ttl
  ) {
    return cache.get(path).data;
  }

  const response = await fetch(
    CORDAX + path,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`Cordax ${response.status}`);
  }

  if (ttl) {
    cache.set(path, {
      ts: Date.now(),
      data
    });
  }

  return data;
}

function last5(rows, team, before) {
  return rows
    .filter(done)
    .filter(
      f =>
        homeOf(f) === team ||
        awayOf(f) === team
    )
    .filter(
      f =>
        new Date(dateOf(f)) < before
    )
    .sort(
      (a, b) =>
        new Date(dateOf(b)) -
        new Date(dateOf(a))
    )
    .slice(0, 5);
}

function weighted(rows, team, index) {
  const weights = [5, 4, 3, 2, 1];

  let numerator = 0;
  let denominator = 0;

  rows.forEach((f, i) => {
    const g = gfga(f, team);

    if (!g) return;

    numerator += g[index] * weights[i];
    denominator += weights[i];
  });

  return denominator
    ? numerator / denominator
    : 0;
}

function form(rows, team) {
  return rows.map(f => {
    const g = gfga(f, team);

    if (!g) return "D";

    if (g[0] > g[1]) return "W";
    if (g[0] < g[1]) return "L";

    return "D";
  });
}

function inferredTier(rows) {
  const counts = {};

  rows.forEach(f => {
    const competition = norm(compOf(f));

    if (ENGLISH_TIER[competition]) {
      counts[competition] =
        (counts[competition] || 0) + 1;
    }
  });

  const key = Object
    .keys(counts)
    .sort(
      (a, b) =>
        counts[b] - counts[a]
    )[0];

  return key
    ? {
        ...ENGLISH_TIER[key],
        key
      }
    : {
        score: 0.78,
        label: "Unknown/Other",
        key: null
      };
}

function standingsStrength(data, team) {
  const rows = arrify(data);

  if (!rows.length) return null;

  const row = rows.find(
    x =>
      norm(
        pick(
          x,
          [
            "Team",
            "team",
            "TEAM",
            "TeamName",
            "teamName",
            "Name",
            "NAME"
          ],
          ""
        )
      ) === norm(team)
  );

  if (!row) return null;

  const pos = Number(
    pick(
      row,
      [
        "Position",
        "position",
        "POS",
        "Rank",
        "rank"
      ],
      NaN
    )
  );

  const n = rows.length;

  return {
    pos,
    percentile:
      Number.isFinite(pos) && n > 1
        ? 1 - (pos - 1) / (n - 1)
        : 0.5
  };
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

function calibrated(p, confidence) {
  const shrink =
    0.45 +
    0.45 * (confidence / 100);

  return clamp(
    0.5 +
      (p - 0.5) * shrink,
    0.05,
    0.95
  );
}

function rawHit(rows, rule, team) {
  if (!rows.length) return 0;

  let hits = 0;

  rows.forEach(f => {
    const [h, a] = scorePair(f);

    if (
      !Number.isFinite(h) ||
      !Number.isFinite(a)
    ) {
      return;
    }

    const isHome =
      homeOf(f) === team;

    const gf = isHome ? h : a;
    const ga = isHome ? a : h;
    const total = h + a;

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
      h > 0 &&
      a > 0
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

  return Math.round(
    (hits / rows.length) * 100
  );
}

async function tryH2H(
  home,
  away,
  competition,
  season,
  token
) {
  try {
    const data = await cordax(
      `/HeadToHead/${encodeURIComponent(
        competition
      )}/${encodeURIComponent(
        season
      )}/${encodeURIComponent(
        home
      )}/${encodeURIComponent(
        away
      )}`,
      token,
      300000
    );

    return arrify(data)
      .filter(done)
      .slice(0, 5);

  } catch {
    return [];
  }
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

  const token =
    process.env.CORDAX_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "CORDAX_TOKEN missing"
    });
  }

  const {
    homeTeam,
    awayTeam,
    competition,
    fixtureDate
  } = req.body || {};

  if (
    !homeTeam ||
    !awayTeam ||
    !competition
  ) {
    return res.status(400).json({
      error: "Missing fixture fields"
    });
  }

  try {
    const before =
      new Date(
        fixtureDate ||
        Date.now()
      );

    const from =
      new Date(before);

    from.setDate(
      from.getDate() - 150
    );

    const fromS =
      from
        .toISOString()
        .slice(0, 10);

    const toS =
      before
        .toISOString()
        .slice(0, 10);

    const season =
      seasonFor(before);

    const [
      homeData,
      awayData
    ] =
      await Promise.all([
        cordax(
          `/Fixtures/from/${fromS}/to/${toS}/team/${encodeURIComponent(
            homeTeam
          )}`,
          token,
          120000
        ),

        cordax(
          `/Fixtures/from/${fromS}/to/${toS}/team/${encodeURIComponent(
            awayTeam
          )}`,
          token,
          120000
        )
      ]);

    const homeAll =
      arrify(homeData);

    const awayAll =
      arrify(awayData);

    const home5 =
      last5(
        homeAll,
        homeTeam,
        before
      );

    const away5 =
      last5(
        awayAll,
        awayTeam,
        before
      );

    if (
      home5.length < 3 ||
      away5.length < 3
    ) {
      return res.status(422).json({
        error:
          "Not enough recent completed matches"
      });
    }

    const homeTier =
      inferredTier(home5);

    const awayTier =
      inferredTier(away5);

    let homeStanding = null;
    let awayStanding = null;

    const competitionKey =
      norm(competition);

    if (
      ENGLISH_TIER[
        competitionKey
      ]
    ) {
      try {
        const standings =
          await cordax(
            `/Standings/${encodeURIComponent(
              competition
            )}/${encodeURIComponent(
              season
            )}`,
            token,
            300000
          );

        homeStanding =
          standingsStrength(
            standings,
            homeTeam
          );

        awayStanding =
          standingsStrength(
            standings,
            awayTeam
          );

      } catch {}
    }

    const h2h =
      await tryH2H(
        homeTeam,
        awayTeam,
        competition,
        season,
        token
      );

    const hGF =
      weighted(
        home5,
        homeTeam,
        0
      );

    const hGA =
      weighted(
        home5,
        homeTeam,
        1
      );

    const aGF =
      weighted(
        away5,
        awayTeam,
        0
      );

    const aGA =
      weighted(
        away5,
        awayTeam,
        1
      );

    const tierDelta =
      homeTier.score -
      awayTier.score;

    const tableDelta =
      homeStanding &&
      awayStanding
        ? homeStanding.percentile -
          awayStanding.percentile
        : 0;

    const baseHome =
      hGF * 0.58 +
      aGA * 0.42;

    const baseAway =
      aGF * 0.58 +
      hGA * 0.42;

    const strengthHome =
      clamp(
        1 +
          tierDelta * 0.48 +
          tableDelta * 0.20,
        0.70,
        1.35
      );

    const strengthAway =
      clamp(
        1 -
          tierDelta * 0.48 -
          tableDelta * 0.20,
        0.70,
        1.35
      );

    const expectedHome =
      clamp(
        baseHome *
          1.08 *
          strengthHome,
        0.15,
        3.8
      );

    const expectedAway =
      clamp(
        baseAway *
          (1 / 1.08) *
          strengthAway,
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
        Math.exp(
          -expectedHome
        ),

      away05:
        1 -
        Math.exp(
          -expectedAway
        ),

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
          58 +
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
              homeTier.key &&
              awayTier.key
                ? 8
                : 0
            ) +
            (
              h2h.length
                ? 8
                : 0
            ),
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
          `${homeTeam}|${awayTeam}|${rule}`,

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
          )}. Recent attack and defence are adjusted for this opponent, home advantage, team strength and table position where available.`,

        stats: {
          expectedHome:
            Number(
              expectedHome.toFixed(
                2
              )
            ),

          expectedAway:
            Number(
              expectedAway.toFixed(
                2
              )
            ),

          homePosition:
            homeStanding?.pos ??
            null,

          awayPosition:
            awayStanding?.pos ??
            null,

          homeTierLabel:
            homeTier.label,

          awayTierLabel:
            awayTier.label,

          h2hGames:
            h2h.length,

          dataConfidence,

          last5HitRate,

          homeForm:
            form(
              home5,
              homeTeam
            ),

          awayForm:
            form(
              away5,
              awayTeam
            )
        }
      });

    const predictions = [
      makePrediction(
        "teamgoal",
        `${homeTeam} over 0.5 goals`,
        "home0.5",
        probabilities.home05,
        rawHit(
          home5,
          "team05",
          homeTeam
        )
      ),

      makePrediction(
        "teamgoal",
        `${awayTeam} over 0.5 goals`,
        "away0.5",
        probabilities.away05,
        rawHit(
          away5,
          "team05",
          awayTeam
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
              homeTeam
            ) +
            rawHit(
              away5,
              "over15",
              awayTeam
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
              homeTeam
            ) +
            rawHit(
              away5,
              "over25",
              awayTeam
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
              homeTeam
            ) +
            rawHit(
              away5,
              "btts",
              awayTeam
            )
          ) / 2
        )
      ),

      makePrediction(
        "double",
        `${homeTeam} or draw`,
        "homeOrDraw",
        probabilities.homeOrDraw,
        rawHit(
          home5,
          "nonloss",
          homeTeam
        )
      ),

      makePrediction(
        "double",
        `${awayTeam} or draw`,
        "awayOrDraw",
        probabilities.awayOrDraw,
        rawHit(
          away5,
          "nonloss",
          awayTeam
        )
      ),

      makePrediction(
        "result",
        `${homeTeam} win`,
        "homeWin",
        probabilities.homeWin,
        rawHit(
          home5,
          "win",
          homeTeam
        )
      ),

      makePrediction(
        "result",
        `${awayTeam} win`,
        "awayWin",
        probabilities.awayWin,
        rawHit(
          away5,
          "win",
          awayTeam
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
          "v8-strength-opponent-calibrated",

        predictions
      });

  } catch (e) {

    return res
      .status(502)
      .json({
        error:
          "Prediction model failed",

        detail:
          e?.message ||
          String(e)
      });
  }
};
