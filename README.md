# Match Index V15.0 — safe working build

This package deliberately keeps deployment simple.

Upload/replace only these files in the existing GitHub repo:

- `index.html`
- `api/football.js`
- `api/predict.js`
- `api/league-xi.js`

There is **no `vercel.json`, cron, database, schema or Supabase dependency** in this build.
It uses the existing Vercel project and the existing `API_FOOTBALL_KEY` environment variable.

Included V15 features:
- coherent Home/Draw/Away probabilities normalised to 100%
- goal-line coherence and per-rule calibration
- Scout → Deep → Final XI model stages
- UK Match Result and BTTS tabs
- premium fixture detail page
- confirmed XI tactical pitch when line-ups are available
- player ratings, confidence, formation/continuity, partnership links and matchup/H2H context
- before/after confirmed-XI forecast movement
- probability history
- corrected pressure-index presentation
- richer data-quality layers and engine-agreement detail
- League XI tab for Premier League, Championship, League One and League Two
- Current / Season / Form XI modes
- UK-only Next 7 Days rankings
- existing local saved/history/performance storage retained

## Deploy
Keep the existing Vercel project connected to the same GitHub repository. Replace the four files above and commit to `main`.
