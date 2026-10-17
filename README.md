# Match Index V16.3 — Team First

A personal football-following and prediction-for-fun app built around the teams Charlie actually cares about.

## Deploy this build

1. **Supabase first:** open Supabase → SQL Editor and run the complete `schema.sql` from this package. It is migration-safe (`create table if not exists`) and also updates the API-budget function.
2. Replace the files in the existing Vercel/GitHub project with **everything in this package**.
3. Keep/add these Vercel Environment Variables:
   - `API_FOOTBALL_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
   - `CRON_SECRET`
   - optional `API_DAILY_SOFT_CAP=5500`
   - optional `API_DAILY_HARD_CAP=7400`
4. Deploy to Production.
5. Open `/api/health`. You want:
   - `version: v16.3-team-first`
   - `apiFootball: true`
   - `supabase: true`
   - `database: true`
6. Open the app and leave it open for a couple of minutes on first run. The Hobby-plan in-app worker progressively builds the followed-team pool, fixtures and predictions. `System → Sync now` speeds up the next chunk.

## What V16.3 changes

### Team-first discovery
Priority is:
1. Oxford United
2. Premier League
3. Championship
4. League One
5. League Two
6. National League
7. Official FIFA men's top 50 (7 Oct 2026 snapshot) + all four Home Nations

The five English leagues are used only to discover current club IDs. Fixtures are then requested by **team ID with no league filter**, so cups, Europe, play-offs and friendlies are not hidden by the discovery architecture. Fixtures are deduplicated by `fixture.id`.

### Predictions
The probability engine is deliberately kept on the stable `v16-match-index-independent-1` model family so the app architecture upgrade does not throw away a model that was already performing well. It retains:
- weighted 20-match history
- home/away splits
- opponent/table strength
- Dixon–Coles score modelling
- rest/congestion
- shot/chance pressure and defensive suppression
- injuries and H2H context
- confirmed-XI strength, formation and partnership continuity
- Initial → Deep Dive → Final XI stages
- historical empirical calibration once a rule/probability band has enough settled samples

Every prediction card leads with **1X2**, then Best Prediction, Top 3 and BTTS.

### Line-ups
The dedicated API-Football line-up endpoint is polled near kick-off. Oxford and imminent games are prioritised. Confirmed XI checks are classified as critical so the protected API reserve remains useful late in the day.

### API safety
- normal-work soft cap: 5,500
- emergency hard cap: 7,400
- ~2,000 calls intentionally preserved for critical XI/live work
- persistent Supabase API cache
- daily Vercel Hobby cron + bounded in-app worker
- first in-app bootstrap is capped at roughly 35 prediction jobs while fixture discovery proceeds separately
- prediction order is confirmed-XI urgency -> Oxford -> domestic Initial coverage -> domestic Deep Dive -> international Initial/Deep

### Never blank
Runtime display fallback is:
1. fresh Supabase state
2. browser last-known-good state
3. shipped static Oxford fixture snapshot
4. visible processing/fixture shell

Good content is never deliberately cleared before replacement data succeeds.

### Oxford page
Rebuilt for 2026/27 around the current club:
- Aaron Ramsey era
- current 4-2-3-1 evidence, while still inferring shape from actual recent team sheets
- official team crest supplied by the football data source
- 2026/27 Inspires Series / Cowley Road / Carfax / Oxford Stone visual cues
- football-proportioned tactics board
- roles derived from actual formation grids rather than generic D/M/F buckets
- confirmed XI when available, otherwise a clearly-labelled evidence-based Best XI

## First test checklist
1. Predictions page shows fixtures even while a prediction says `Prediction processing`.
2. Oxford appears before other teams.
3. A followed team's cup/European fixture appears even though it is not in its domestic league.
4. 1X2 adds to 100% on completed predictions.
5. Results opens `Prediction vs result` and shows Initial / Deep Dive / Final XI stages.
6. Oxford page shows a proper 11-player tactical shape rather than position buckets.
7. `/api/health` reports budget and followed-team counts.
