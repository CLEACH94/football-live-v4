# Match Index V17 — Beam Me Up

This is the clean V17 rebuild. It keeps the existing Turso + API-Football environment variables and removes the phone-heavy browser-worker architecture.

## Upload
Upload the contents of this ZIP to the repository root and replace files with the same names.

Required Vercel environment variables stay the same:
- API_FOOTBALL_KEY
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- CRON_SECRET (recommended)

No Supabase is used.

## What V17 changes
- Compact football-app UI; giant marketing hero panels removed.
- Fixtures grouped by competition/league and ranked by prediction strength.
- Tap any fixture: if it has no prediction, Match Index predicts it immediately on the server.
- League pages: Premier League, Championship, League One, League Two, National League.
- Selecting a league/date automatically runs the fast Initial pass for missing predictions.
- Dedicated fixture match-centre: 1X2, Best Prediction, Top 3, BTTS, confidence/reasons, stage movement, lineup status.
- Deep Dive can be requested from the fixture page.
- Manual lineup check remains league-by-league and follows teams in that division even if the fixture is a cup match.
- Lineups are all checked first; Final XI recalculation happens second.
- Projected final table for all five English leagues using current standings + remaining league fixtures + 1,200 simulations.
- Oxford page rebuilt as a compact club/tactics page with current crest from API data and latest confirmed XI on a real pitch.
- Results page loads separately from the lightweight main state endpoint.
- Data page fixes the old 1X2 metric: it now scores the highest-probability 1/X/2 choice per fixture/stage instead of counting all three outcomes as separate picks.
- Best Prediction accuracy is calculated on meaningful markets, excluding trivial Under 4.5 / team-over-0.5 padding.
- International fixtures are not crawled team-by-team. They only appear when a followed top-50/Home Nation has an actual fixture in the refreshed date window.
- No Paddy Power integration in this build.

## Server / phone behaviour
The browser no longer runs a constant worker loop. It loads compact state and makes explicit server requests only when needed.

Vercel Hobby gets one daily cron refresh at 06:05 UTC. Vercel documents Hobby cron precision as once per day; the app also has a manual Refresh fixtures action.

## First test after deploy
1. Open `/api/health` — version should be `v17-beam-me-up`.
2. Open Match Index. If fixtures are stale/empty, tap `Refresh fixtures` once.
3. Tap any unpredicted fixture. It should open the match centre and run Initial immediately.
4. Open Leagues -> choose a league. Missing Initial predictions for that date view should be built automatically.
5. Open `Projected final table` on the league page.
6. Near kick-off, choose the league and tap `Check lineups`.

## Important
The real API-Football/Turso production integration can only be certified after this deploy runs against your actual Vercel environment. V17 deliberately exposes errors in the relevant page instead of hiding them behind an endless queue.
