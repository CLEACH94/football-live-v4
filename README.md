# Match Index V16.3.1 — Turso Team-First

This is the corrected V16.3 build. The accidental Supabase dependency has been removed.

## Vercel environment variables
- `API_FOOTBALL_KEY`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- optional `CRON_SECRET`

No Supabase variables are required.

## First deploy
1. Upload this project to the same GitHub/Vercel project.
2. Redeploy.
3. Open `/api/health`.
4. Confirm `apiFootball: true`, `turso: true`, `database: true`.
5. Open Match Index -> System -> Sync now and keep the page open for the first discovery pass.

The Turso schema is created automatically by `api/_db.js`; `schema.sql` is supplied only as a reference/manual fallback.

## Architecture
- team-first discovery: Oxford United first, then Premier League, Championship, League One, League Two, National League, then international pool
- fixtures fetched by team ID across competitions
- fixture discovery separate from expensive prediction processing
- Scout -> Deep Dive -> Final XI
- dedicated line-up polling near kick-off
- persistent API cache, state, audit and prediction stages in Turso
- last-known-good browser/static fallback
- 1X2 first, then best prediction, top 3 and BTTS
