# First deployment checklist

1. Create a free Turso database.
2. In Vercel > Project > Settings > Environment Variables add:
   - TURSO_DATABASE_URL
   - TURSO_AUTH_TOKEN
3. Keep API_FOOTBALL_KEY exactly as it is today.
4. Upload all files from this ZIP to the GitHub repo and deploy.
5. Open Match Index > System.
6. Confirm TURSO says ONLINE.
7. If you want old browser/cloud history, use the manual Import old history control. Do not import automatically.
8. In GitHub repo > Settings > Secrets and variables > Actions add MATCH_INDEX_BASE_URL with the deployed Vercel URL.
9. Open Actions > Match Index Daily > Run workflow once.
10. Reopen Match Index. Stored forecasts should load without the phone having to calculate them.

If Turso is not configured, the app still loads fixtures but persistent predictions will not survive as the new source of truth.
