# MATCH INDEX V15.4 — LIVE SERVER

This package is designed to be uploaded over the current Match Index project.

## What is included

- Current V15.3 frontend and model features
- Server-side fixture snapshots
- Automatic lineup + bench checking
- Automatic final-XI prediction priority
- Server-side live match snapshots
- Central prediction snapshots
- API-Football daily request budget protection
- Server cron endpoint ready for a 2-minute scheduler
- `vercel-pro-cron.json` contains the production Vercel Pro schedule, but is deliberately NOT active on first upload so a Hobby Vercel project cannot fail deployment
- Supabase schema
- `/api/health` setup checker
- Browser fallback: the current app still works before Supabase is configured

## Files to upload

Upload **everything** in this folder to the repo root, replacing files with the same name.

Do not put any secret keys in GitHub.

## Environment variables required in Vercel

Existing:
- `API_FOOTBALL_KEY`

New:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred) OR legacy `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` — random string, at least 16 characters

Optional:
- `API_DAILY_SOFT_CAP=6500`
- `API_DAILY_HARD_CAP=7400`

The hard cap deliberately leaves roughly 100 requests below a 7,500/day API-Football plan limit. The soft cap preserves a larger reserve for live data and confirmed lineups.

## Supabase

Create a Supabase project and run `schema.sql` once in SQL Editor.

Use a **server secret key** in Vercel. Never put it in `index.html`, GitHub, or client-side JavaScript.

## Scheduler

The first upload deliberately has **no active `vercel.json` cron**. This makes the package deployment-safe before we check your Vercel plan. `vercel-pro-cron.json` contains the ready-made 2-minute schedule. Once Supabase and the environment variables are confirmed, we will activate the scheduler as the final setup step. `CRON_SECRET` protects `/api/cron`.

## After setup

Open:

`https://YOUR-DOMAIN/api/health`

You want:
- `ok: true`
- `apiFootball: true`
- `supabase: true`
- `cronSecret: true`
- `database: true`

Then in Vercel go to **Settings → Cron Jobs** and confirm `/api/cron` is active.

## Important behaviour

The server uses one central snapshot per fixture. Ten or ten thousand people opening the same fixture do not each need to trigger the same upstream live-data call.

The browser continues to work as a fallback during setup, so uploading this package first should not make the existing app dependent on Supabase immediately.


