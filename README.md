# Match Index V15.3 — Live Match Mode v1

Safe upgrade from V15.2. No database, cron, Supabase or Vercel infrastructure changes.

## Added
- Live Match Mode on fixture detail pages once a match is live (and retained at full-time for review)
- Live score and minute/status
- Total shots
- Shots on target
- Possession
- Corners
- Cards
- Match Index live pressure indicator
- Locked pre-match forecast remains visible and is never overwritten by live data
- Simple live forecast tracking state
- Manual “Refresh live” action
- Live detail refresh every 30 seconds while that fixture page is open
- Existing manual “Refresh XI + bench” remains intact

## Files to upload
Replace the current files with everything in this folder:
- index.html
- api/football.js
- api/predict.js
- api/league-xi.js
- README.md

This build deliberately does not add background/server persistence yet. That is the next step after Live Match Mode v1 is verified.
