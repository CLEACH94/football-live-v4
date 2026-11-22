# V17 test report

Completed locally:
- `index.html` embedded JavaScript syntax: PASS
- all V17 API JavaScript syntax: PASS
- compact home fixture rendering with mocked state: PASS
- league-first view rendering with mocked state: PASS
- dedicated fixture detail rendering with mocked prediction data: PASS
- fixture detail contains 1X2 / Best / Top 3 / BTTS / confidence / stage movement: PASS
- responsive 390px mobile visual inspection: PASS
- no browser interval/polling worker present: PASS
- package contains Turso database adapter, not Supabase: PASS
- daily Vercel cron expression only: PASS

Not possible to certify locally:
- real Turso authentication
- real API-Football responses/coverage
- Vercel production environment variables
- real lineup-provider timing

Those require the deployed production environment.
