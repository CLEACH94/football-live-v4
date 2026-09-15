# Match Index master-spec checkpoint

This repository is built against the agreed product direction in the chat. Key locked rules:

- Mission: build the most accurate football prediction model possible.
- Core probabilities remain independent of bookmaker/third-party prediction outputs.
- Probability, data quality and model agreement are separate concepts.
- Primary tabs: Predictions / Oxford United / League Predictor / Data / System.
- Prediction stages: Initial / Deep Dive / Final XI.
- Stored-first architecture; browser storage is not the primary source of truth.
- Vercel frontend/API + Turso persistent database + GitHub Actions background worker.
- Oxford first; England Initial before England Deep Dive; then Scotland and wider leagues.
- 2,000 API-Football requests protected as a hard reserve.
- Manual XI checks; no constant lineup polling.
- Manual Top-25 XI refresh.
- Manual League Predictor refresh.
- Base models -> validated ensemble -> calibration -> published probability.
- Point-in-time feature integrity and chronological validation.
- Champion/Challenger changes are evidence-led; production promotion remains manual.
- Result settlement is best-effort and resumable, not dependent on exact GitHub schedule timing.
- Partial failures remain partial; stale valid data beats a blank app.
- Oxford uses the same core model, not an Oxford-only model.
- Sparse data may abstain rather than publish fake precision.
- Accuracy methodology is versioned rather than silently rewriting history.
- Supporting score-derived outputs must remain coherent with the same score distribution.
