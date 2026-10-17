# V16.3 local test report

Completed before packaging:

- All server-side `.js` files: **Node syntax PASS**
- `index.html` embedded JavaScript: **Node syntax PASS**
- `vercel.json`: **valid JSON**
- `data/last-known-good.json`: **valid JSON**
- Team-first structural mock integration: **PASS**
  - Oxford receives priority 0
  - five English tiers populate the club pool
  - international pool begins resolving from the ranking list
  - fixture discovery requests use `/fixtures?team=...`
  - fixture discovery contains no league filter
  - a cross-competition (FA Cup) fixture is retained
  - duplicate fixture IDs are stored once
  - worker lock is released after each run
- Oxford formation rendering uses API formation grids and row-aware football roles.
- Confirmed line-up polling uses the dedicated `/fixtures/lineups` endpoint.
- Static fallback Oxford fixtures were checked against the 2026/27 League One schedule on 17 Oct 2026.

Not claimable from this offline build environment:
- live production API-Football response compatibility with the user's key/plan
- live Supabase permissions/environment variables
- Vercel production cron execution

Use `/api/health` immediately after deployment to validate those production pieces.
