# Match Index V15.1 — Premium XI build

Safe browser-first build. No database, cron, Supabase or deployment infrastructure files.

## Included
- Premium UI/stability pass
- Fixed-height ranking cards to reduce tap-jumping while data updates
- Manual **Refresh XI + bench** button on fixture pages
- Manual XI refresh takes priority over the background analysis queue, then normal analysis resumes
- Clear provider status if a confirmed lineup is not returned
- Confirmed XI tactical presentation, bench, formations and partnership intelligence
- League XI locked to 4-3-3: 1 GK, 4 DEF, 3 MID, 3 ATT
- Premier League, Championship, League One and League Two League XI
- Existing V15 coherent probabilities, calibration and performance tracking retained
- Removed stale server snapshot call from the safe build

## Upload
Replace the existing working app files with:
- index.html
- api/football.js
- api/predict.js
- api/league-xi.js
- README.md

Do not add vercel.json, schema.sql, cron or database files.
