# MATCH INDEX V15.5 RESCUE

Purpose: restore speed/reliability after V15.4, protect historical performance, settle completed results server-side, and stop runaway API-Football usage.

## IMPORTANT ORDER
1. In Supabase SQL Editor, run the entire `schema.sql` once. It is safe to run on the existing V15.4 database (`create table if not exists`).
2. Upload all files/folders from this package to the existing GitHub repo, replacing same-named files.
3. Deploy that exact commit to Vercel Production.
4. Check `/api/health` says `v15.5-rescue` and database true.
5. Open Match Index. Existing browser performance history is uploaded to Supabase before the server copy is merged.

## Historical data on the old long Vercel URL
If the 216-result history only exists on the old deployment URL, open that old URL first and use Performance → Export model data. On V15.5 use Performance → Restore data and select the JSON. V15.5 then stores it in Supabase permanently.

## What changed
- Persistent Supabase API response cache shared by cron, browser proxy and model.
- Server-first loading: last good page is not blanked during refresh.
- Browser auto-analysis queue stops when the server is configured.
- Cron uses cached fixture windows and batched lineup checks instead of hammering API-Football.
- Dedicated lineup fallback only becomes aggressive close to kick-off.
- Manual `Refresh XI + bench` bypasses lineup cache.
- Live statistics are on-demand and server-cached, rather than fetching every live match every cron run.
- Completed server predictions are settled into `mi_model_audit` automatically.
- Browser historical audit is mirrored into Supabase.
- Rolling 7-day fixture window is warmed server-side.

Default budget guard remains 6,500 soft / 7,400 hard. Do not raise it to compensate for bad polling; V15.5 is designed to reduce polling instead.
