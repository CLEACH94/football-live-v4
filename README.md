# Match Index V16 — Persistent World-Class Foundation

This build takes the uploaded V15.3 emergency build and moves Match Index toward the agreed stored-first architecture without throwing away the working prediction engine.

## What changed
- Five primary tabs: Predictions / Oxford / League / Data / System.
- Turso becomes the persistent source of truth when configured.
- Large prediction/history/audit payloads no longer rely on browser localStorage.
- The working V15 engine is used as the base, but API-Football’s own prediction output has been removed from the core ensemble to satisfy the agreed independence rule. The resulting engine is versioned `v16-match-index-independent-1`.
- Manual Top-25 XI check.
- Manual League Predictor with Monte Carlo scoreline simulation and coherent latent team-strength draws.
- Oxford United intelligence page with current squad strength view and next-fixture context.
- Manual legacy-history importer.
- System/status page.
- GitHub Actions worker for off-device Initial + Deep processing.
- Stored-first frontend: cloud state is loaded before fixture rendering.
- Browser-driven automatic prediction queue is disabled by default so opening the app does not start heavy processing.

## Required Vercel environment variables
Keep your existing:
- `API_FOOTBALL_KEY`

Add for Turso:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

## GitHub Actions setup
Add this GitHub repository secret:
- `MATCH_INDEX_BASE_URL` = your deployed Vercel URL, e.g. `https://football-live-v4.vercel.app`

The workflow can then be run manually from GitHub Actions and also has a daily schedule. GitHub scheduled workflows are best-effort; the app does not rely on exact-minute execution.

## Important model status
The prediction API identifies itself as `v16-match-index-independent-1` because the forecasting logic has materially changed: third-party/API-Football prediction percentages no longer feed the core ensemble. It should be treated as the new architecture-compliant baseline and measured from here; the Data/Champion-Challenger framework is intended to validate future changes rather than invent performance claims.

## Deployment
Upload/replace the repository with the full contents of this ZIP, keep the environment variables above, deploy on Vercel, then open **System** and confirm Turso shows ONLINE.

## Free-tier design
The build is designed around Vercel + Turso + GitHub Actions. Usage still needs monitoring; no free platform can be guaranteed to remain unlimited forever.
