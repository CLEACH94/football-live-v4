# Match Index V15.4.1 — Lineup Hotfix

- Sweeps every near-kickoff fixture in bulk batches of up to 20 IDs.
- Adds a direct dedicated-lineup fallback for the 10 most urgent fixtures inside T-45.
- Prediction/final-XI analysis falls back to enriched fixture lineup data if the dedicated feed lags.
- Tightens near-kickoff client refresh cadence to 2 minutes.
- Keeps the existing API quota guardrails and active 2-minute Vercel cron.
