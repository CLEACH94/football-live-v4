# Match Index V15

V15 is the controlled major update built on the working V14 model rather than a rewrite from scratch.

## Included

- V15 coherent probability engine
  - Home / Draw / Away is normalised to exactly 100%.
  - Double-chance results are derived from the coherent 1X2 distribution.
  - Goal-line ordering is guarded so related outcomes cannot contradict one another.
  - Per-rule calibration is retained and reapplied coherently in the browser.
- Scout → Deep → Final XI model stages.
- Engine-level probability logging and leave-one-engine-out ablation data for future validation.
- Separate team / squad / context / overall evidence-quality scores.
- Pressure converted to a 0–100 display index on fixture pages.
- Confirmed-line-up fixture view:
  - actual starting XI plotted from API-Football grid positions;
  - bench;
  - Match Index player rating where player-season data is available;
  - rating confidence;
  - formation and continuity;
  - partnership links and partnership ratings;
  - restrained positive/negative H2H context indicator;
  - Deep → Final XI probability movement;
  - probability history.
- League XI tab:
  - Premier League, Championship, League One, League Two dropdown;
  - Current / Season / Form modes;
  - balanced XI selected by position and formation;
  - premium tactical-pitch presentation.
- UK Match Result and BTTS views retained.
- Next 7 Days rankings remain UK-only.
- Model performance:
  - per-market calibration;
  - binary Brier score;
  - proper three-way Match Result top-choice accuracy and multiclass Brier score;
  - confirmed-XI test count.
- Model data export retained.
- Optional server-side memory + background engine using Supabase and Vercel Cron.
  - browser registers upcoming fixtures;
  - server stores snapshots and audit records;
  - background job intelligently re-runs promising/near-kickoff fixtures;
  - confirmed XI is picked up even when the phone is closed;
  - completed fixtures are settled automatically in the server audit.

## Files

- `index.html` — V15 web app.
- `api/football.js` — secure API-Football proxy.
- `api/predict.js` — V15 prediction engine.
- `api/league-xi.js` — league XI engine.
- `api/snapshots.js` — server snapshot/audit persistence.
- `api/cron.js` — background analysis + settlement worker.
- `api/_db.js` — small Supabase REST helper.
- `schema.sql` — database tables.
- `vercel.json` — 10-minute background schedule.

## Existing environment variable

Keep:

`API_FOOTBALL_KEY`

## Turn on true background operation

The app still works without a database, but background persistence is disabled until Supabase is configured.

1. Create a Supabase project.
2. Open its SQL editor and run `schema.sql` once.
3. In Vercel → Project → Settings → Environment Variables add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - optionally `CRON_SECRET`
4. Redeploy.
5. Open Match Index once. The app registers the upcoming fixture set with the server. After that, the scheduled worker can maintain those fixtures while the browser is closed.

Do not put the Supabase service-role key in `index.html`; it belongs only in Vercel environment variables.

## Deployment

Replace the repo root with the contents of this folder (or upload the ZIP contents), keeping the same Vercel project. Existing local V14 history is not rewritten; V15 starts a new model version while the old audit remains available in local storage for comparison.
