# Match Index V16.5 local checks

- index.html embedded JavaScript syntax: PASS
- api/_engine.js syntax: PASS
- api/worker.js syntax: PASS
- api/state.js syntax: PASS
- api/health.js syntax: PASS
- api/audit.js syntax: PASS
- State endpoint no longer returns audit history or full raw prediction payloads by default.
- Fast Scout writes the same prediction-table shape expected by the existing UI and Deep Dive worker.
- Initial 1X2 values are normalised to exactly 100%.
- Manual confirmed-lineup flow remains handled by the existing api/lineups.js.

Production API-Football/Turso/Vercel execution can only be verified after deployment in the user's live environment.
