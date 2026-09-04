# QAmate — Render Deployment Plan

How to host QAmate on [Render](https://render.com). There is **no database** —
the app reads the Google Sheet directly, held in an in-memory cache inside the
one running web service. This covers the Render services to create, every
environment variable, the scheduled refresh, and a verification checklist.

---

## 0. TL;DR

| Thing | Value |
|---|---|
| Service type | **Web Service** (Node) |
| Build command | `npm install && npm run build` |
| Start command | `npm run start` |
| Health check path | `/qa` |
| Node version | `20` (min supported 18.18) |
| Database | **None** — the sheet is read live and cached in memory (~60s TTL) |
| Scheduled refresh | **Render Cron Job**, every 10 min, `curl` → `/api/sync/run?trigger=cron` |
| Plan | Web: Starter ($7/mo) recommended — see §6 for why Free is workable but worse. |

The frontend never calls Google directly — only the server does, and only the
server holds credentials. All secrets live on the server as Render env vars.

---

## 1. Create the Web Service

Render Dashboard → **New → Web Service** (or **New → Blueprint** using the
committed [`render.yaml`](render.yaml), which defines this plus the cron job
in one step) → pick the QAmate repo.

| Setting | Value |
|---|---|
| Name | `qamate` |
| Region | any (e.g. `Singapore`) |
| Branch | your deploy branch |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Health Check Path | `/qa` |
| Plan | Starter ($7/mo) recommended; Free works but cold-starts (§6) |
| Auto-Deploy | On (deploy on push) — your call |

`next start` binds to the `PORT` Render injects automatically — no flag
needed. There's no pre-deploy step and nothing to migrate.

---

## 2. Environment variables (Web Service → Environment)

| Key | Value | Notes |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | *base64 of the service-account JSON, one line* | Mark **secret**. |
| `QA_SHEET_ID` | *sheet id from the workbook URL* | The part between `/d/` and `/edit`. |
| `SYNC_WEBHOOK_SECRET` | *long random string* | Must match the Apps Script (§5) and the cron job (§4). Generate: `openssl rand -hex 32`. Mark **secret**. |
| `SHARE_TOKEN_SECRET` | *long random string* | Signs read-only client share links. `openssl rand -hex 32`. Mark **secret**. |
| `SYNC_STALE_WARN_MINUTES` | `15` | Header pill turns amber after this. |
| `SYNC_STALE_ERROR_MINUTES` | `60` | Header pill turns red after this. |
| `NODE_VERSION` | `20` | Pin the Node runtime. |
| `NEXT_TELEMETRY_DISABLED` | `1` | Optional. |

Without `GOOGLE_SERVICE_ACCOUNT_KEY`/`QA_SHEET_ID` set, the app runs on the
seeded snapshot — it never fails to start.

---

## 3. First deploy & verification

1. Trigger the first deploy. Watch the log: `npm install` → `next build` →
   `next start`. The service should reach **Live** and the health check on
   `/qa` should pass — immediately, on the seed snapshot, even before any
   Google credentials are set.
2. Add `GOOGLE_SERVICE_ACCOUNT_KEY` and `QA_SHEET_ID`, save (triggers a
   redeploy).
3. Web Service → **Shell** → `npm run check:sheet` — verifies auth, sheet
   access, the Sheets API is enabled, and that the workbook has all 9 required
   tabs (including `Issues`) with the right headers.
4. Reload `https://qamate.onrender.com/qa` — the header pill should now say
   it's reading from the sheet.

---

## 4. Scheduled refresh (optional but recommended)

The in-memory cache refetches on its own after ~60 seconds on the next
request. A cron keeps it fresh even with **no visitors**, and is the only way
to notice rows removed from the sheet promptly rather than on whatever request
happens to trigger the next natural refetch:

- **Schedule:** `*/10 * * * *`
- **Command:** `curl -fsS -X POST -H "X-QA-Sync-Secret: $SYNC_WEBHOOK_SECRET" "https://qamate.onrender.com/api/sync/run?trigger=cron"`

This is already set up as the `qamate-sync` cron job in [`render.yaml`](render.yaml)
— it hits the running web service over HTTP, so the cron job itself needs no
Google credentials, just the shared secret, and a no-op build
(`buildCommand: "true"`).

> `/api/sync/run` checks the `X-QA-Sync-Secret` header against
> `SYNC_WEBHOOK_SECRET` once that variable is set to something other than
> `change-me` — set the **same** value on both the `qamate` web service and the
> `qamate-sync` cron job, or the cron's calls return 401.

---

## 5. Point the Apps Script webhook at Render (optional)

For near-instant updates while QA edits the sheet, in addition to the 10-min
cron:

1. Google Sheet → **Extensions → Apps Script**.
2. Paste the script from the comment block at the top of
   [`src/app/api/sync/webhook/route.ts`](src/app/api/sync/webhook/route.ts).
3. Set in that script:
   - `URL = 'https://qamate.onrender.com/api/sync/webhook'`
   - `SECRET = '<same value as SYNC_WEBHOOK_SECRET on Render>'`
4. Add an **installable On-edit trigger** (Triggers → Add Trigger → event type
   "On edit").

Both `/api/sync/run` and `/api/sync/webhook` do the same thing now: invalidate
the in-memory cache and refetch immediately. There's no reconciliation to run
and nothing to mark as deleted — the sheet is the only copy of the data.

---

## 6. Free-tier caveats

| Resource | Free-tier behaviour | Recommendation |
|---|---|---|
| Web Service (Free) | Spins down after ~15 min idle; next request cold-starts (~50s) and refetches the sheet from scratch. A cold cron hit can time out. | Starter ($7/mo) for anything people rely on. |
| Cron Job | Runs fine on Free; just a scheduled `curl`. | Free is OK here. |

Total for a solid setup: **~$7/mo** (Starter web), plus $0 for the cron job —
no database cost at all.

---

## 7. Post-deploy verification checklist

- [ ] Web service is **Live**; `https://qamate.onrender.com/qa` loads —
      immediately, even before Google credentials are set (seed data).
- [ ] Health check on `/qa` is green in the Render dashboard.
- [ ] `npm run check:sheet` from the Shell passes all checks, including the
      `Issues` tab.
- [ ] A manual `POST /api/sync/run?trigger=manual` returns `"ok": true` and
      `"source": "sheet"`.
- [ ] The header pill on `/qa` shows it's reading from the sheet, not the seed.
- [ ] `/qa/cases` shows the real case count from the sheet (not 433 seed).
- [ ] `/qa/issues` shows real issues from the sheet's `Issues` tab, or the seed
      banner if that tab is empty/missing.
- [ ] The cron job's last run is green and within the last 10 minutes.
- [ ] (If configured) edit a cell in the sheet → within ~30s the webhook fires
      and `/qa` reflects the change.

---

## 8. Rotate the exposed key

The service-account private key was shared in plaintext during setup. Once the
Render deploy is verified working:

1. Google Cloud Console → IAM & Admin → Service Accounts →
   `qamate-reader@qamate-507611.iam.gserviceaccount.com` → **Keys**.
2. **Add key → Create new key → JSON**. Download it.
3. Base64-encode it (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))`)
   and update `GOOGLE_SERVICE_ACCOUNT_KEY` on Render **and** in the local
   `.env`.
4. Redeploy, confirm `check:sheet` still passes.
5. Back in the Keys tab, **delete** the old key `b9617d40…`.
