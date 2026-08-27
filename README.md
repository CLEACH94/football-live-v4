# Match Index V15.3 — Structural Premium

This is a frontend-only structural redesign based on the working V15.2 build.

## What changes
- Four-item primary navigation: Rankings, Results, League XI, More
- Rankings restructured around filters, discovery and fixtures
- Fixtures move ahead of engine/debug detail
- Engine becomes a compact expandable status row at the bottom of Rankings
- Cleaner fixture cards with less heavy navy/yellow treatment
- Fixture detail is more compact and editorial
- Confirmed-XI pitch is shorter and only the strongest partnership links are shown
- Missing player metrics stay hidden
- Saved controls do not overlay fixture detail or League XI
- Layout reserves space while data refreshes to reduce tap-shifting/flicker

## What does NOT change
- Existing API files
- Vercel configuration
- Environment variables
- Database / cron / Supabase
- Prediction engine logic

Upload `index.html` over the current `index.html`. You can also upload this README if you want the build note in GitHub. Leave the existing `api` folder alone.
