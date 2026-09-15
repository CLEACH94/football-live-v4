const base = (process.env.MATCH_INDEX_BASE_URL || '').replace(/\/$/, '');

if (!base) {
  throw new Error('MATCH_INDEX_BASE_URL is required');
}

const leagues = [
  39, 40, 41, 42, 43,   // England
  179,                   // Scotland
  140,                   // Spain
  78,                    // Germany
  135,                   // Italy
  61,                    // France
  88,
  94,
  144,
  203,
  197,
  207,
  218,
  119,
  103,
  113,
  253,
  71,
  128
];

const englishRank = new Map([
  [39, 1],
  [40, 2],
  [41, 3],
  [42, 4],
  [43, 5]
]);

const maxFixtures = Math.max(
  1,
  Number(process.env.MAX_FIXTURES_PER_RUN || 35)
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ymd = date => date.toISOString().slice(0, 10);

function currentFootballSeason(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  // European football seasons normally begin in summer.
  // Jan-Jun belongs to the season that began the previous year.
  return month >= 7 ? year : year - 1;
}

async function get(path) {
  const response = await fetch(base + path, {
    headers: {
      'User-Agent': 'MatchIndexWorker/16'
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.error ||
      `${path} returned HTTP ${response.status}`
    );
  }

  return data;
}

async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'MatchIndexWorker/16'
    },
    body: JSON.stringify(body)
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.error ||
      `${path} returned HTTP ${response.status}`
    );
  }

  return data;
}

const start = new Date();
const end = new Date(Date.now() + 7 * 86400000);

const season = currentFootballSeason(start);

console.log('Match Index worker starting');
console.log('Date range:', ymd(start), 'to', ymd(end));
console.log('Football season:', season);

const fixtures = [];

for (const league of leagues) {
  try {
    const path =
      `/api/football?endpoint=fixtures` +
      `&league=${league}` +
      `&season=${season}` +
      `&from=${ymd(start)}` +
      `&to=${ymd(end)}` +
      `&timezone=Europe%2FLondon`;

    const data = await get(path);

    const returned = Array.isArray(data?.response)
      ? data.response
      : [];

    console.log(
      `League ${league}: ${returned.length} fixtures returned`
    );

    for (const fixture of returned) {
      const status = fixture?.fixture?.status?.short;

      if (['NS', 'TBD'].includes(status)) {
        fixtures.push(fixture);
      }
    }
  } catch (error) {
    console.warn(
      'Fixture load failed:',
      league,
      error.message
    );
  }

  await sleep(120);
}

if (fixtures.length === 0) {
  throw new Error(
    `No upcoming fixtures found for season ${season} between ` +
    `${ymd(start)} and ${ymd(end)}. Worker stopped instead of reporting false success.`
  );
}

fixtures.sort((a, b) => {
  const aOxford = /oxford united/i.test(
    `${a?.teams?.home?.name || ''} ${a?.teams?.away?.name || ''}`
  ) ? 0 : 1;

  const bOxford = /oxford united/i.test(
    `${b?.teams?.home?.name || ''} ${b?.teams?.away?.name || ''}`
  ) ? 0 : 1;

  if (aOxford !== bOxford) {
    return aOxford - bOxford;
  }

  const aRank = englishRank.get(a?.league?.id) || 100;
  const bRank = englishRank.get(b?.league?.id) || 100;

  if (aRank !== bRank) {
    return aRank - bRank;
  }

  return new Date(a.fixture.date) - new Date(b.fixture.date);
});

const selected = fixtures.slice(0, maxFixtures);

console.log(
  `Processing ${selected.length}/${fixtures.length} fixtures`
);

let reserveHit = false;
let successfulPredictions = 0;
let failedPredictions = 0;

for (const stage of ['scout', 'deep']) {
  for (let i = 0; i < selected.length; i++) {
    if (reserveHit) {
      break;
    }

    const fixture = selected[i];

    const fixtureName =
      `${fixture.teams.home.name} v ${fixture.teams.away.name}`;

    try {
      const prediction = await post('/api/predict', {
        fixtureId: fixture.fixture.id,
        homeTeam: fixture.teams.home.name,
        awayTeam: fixture.teams.away.name,
        homeTeamId: fixture.teams.home.id,
        awayTeamId: fixture.teams.away.id,
        competition: fixture.league.name,
        fixtureDate: fixture.fixture.date,
        leagueId: fixture.league.id,
        season: fixture.league.season || season,
        mode: stage
      });

      const payload = {
        ts: Date.now(),
        model: prediction.model,
        stage: prediction.analysisStage || stage,
        lineupConfirmed: !!prediction.lineupConfirmed,
        lineupChecked: !!prediction.lineupChecked,
        hasIntervening: !!prediction.hasIntervening,
        interveningUntil:
          prediction.interveningUntil || null,
        evidence: prediction.evidence || {},
        dataLayers: prediction.dataLayers || null,
        lineups: prediction.lineups || null,

        predictions: (prediction.predictions || []).map(item => ({
          ...item,
          fixtureId: String(fixture.fixture.id),
          fixture: fixtureName,
          competition: fixture.league.name,
          kickoff: fixture.fixture.date,
          model: prediction.model
        }))
      };

      if (
        Number.isFinite(prediction?.quota?.daily) &&
        prediction.quota.daily <= 2000
      ) {
        console.warn(
          'Protected API reserve reached:',
          prediction.quota.daily
        );

        reserveHit = true;
      }

      await post('/api/state', {
        action: 'upsertPrediction',
        fixtureId: String(fixture.fixture.id),
        payload,
        predictionTs: new Date().toISOString(),
        dataCutoffTs: new Date().toISOString(),
        featureVersion: 'v16-feature-1',
        calibrationVersion: 'v16-cal-1',
        cycleId: `${ymd(start)}-${stage}`
      });

      successfulPredictions++;

      console.log(
        `${stage} ${i + 1}/${selected.length}: ${fixtureName}`
      );
    } catch (error) {
      failedPredictions++;

      console.warn(
        `${stage} failed: ${fixtureName}`,
        error.message
      );
    }

    await sleep(250);
  }

  if (reserveHit) {
    break;
  }
}

await post('/api/state', {
  action: 'setState',
  key: 'last_worker_status',
  payload: {
    status: reserveHit ? 'reserve-stop' : 'complete',
    completedAt: new Date().toISOString(),
    fixtures: selected.length,
    successfulPredictions,
    failedPredictions,
    stages: ['initial', 'deep'],
    season,
    source: 'github-actions'
  }
}).catch(error => {
  console.warn(
    'Could not save worker status:',
    error.message
  );
});

console.log('Worker complete');
console.log('Successful prediction writes:', successfulPredictions);
console.log('Failed prediction writes:', failedPredictions);

if (successfulPredictions === 0) {
  throw new Error(
    `Worker found ${selected.length} fixtures but stored zero predictions. Check prediction logs above.`
  );
}
