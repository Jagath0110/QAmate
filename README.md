# QAmate — Oraxs QA Console

A client-facing QA dashboard driven from the QA team's Google Sheet.
Two levels: a **QA Summary** (health, progress, coverage, risk) and the
**complete test case list** with search, filters and a full detail view — plus an
**Issues** tab that tracks every failure from GitHub issue through fix, retest
and senior sign-off.

Built against the real structure of `OraxsHumanManualTestReportv1` — its 19
columns, 7 test tabs, 32 modules and 22 test types.

---

## Run it

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run setup             # generate Prisma client, create the DB, load seed data
npm run dev               # http://localhost:3000/qa
```

`npm run setup` works with **no credentials**. It loads a captured snapshot of
the workbook — 298 manual cases and 135 automated scenarios — so you can see the
finished product immediately. Add Google and GitHub credentials to `.env` when
you want live data; nothing else changes.

Requires Node 18.18+.

---

## What you get

### QA Summary — `/qa`

| Section | What it answers |
|---|---|
| **Execution ledger** | How much testing is done, what passed, what failed — one band, 298 cases |
| **QA health score** | Overall quality status, with the formula printed beside it |
| **KPI strip** | Total, execution %, pass %, failure %, blocked/retest, automation coverage |
| **Module health** | Which modules have the most issues — sorted by open risk, not alphabetically |
| **Needs attention** | The failed, blocked and retest cases, clickable |
| **Coverage charts** | By test type, priority and platform — each split executed vs. not-yet-run |
| **Manual vs. automated** | Automation coverage, and *why* 298 cases need a human |
| **Pass-rate trend** | Plots from daily snapshots; explains itself until two exist |
| **Defect & issue status** | The 4-step lifecycle at a glance, linking to the Issues tab |
| **Recently updated** | Newest execution results from the sheet |

### Test Cases — `/qa/cases`

All 433 scenarios. Nine columns, 13 filters (search, status, area, module, type,
priority, platform, manual/automated, tester, date from/to, failed-and-blocked
toggle, reset), sortable headers, pagination at 25/50/100, CSV export of the
current view, and a detail drawer showing all 19 fields with test steps parsed
into a numbered list.

Filter state lives in the URL, so any filtered view is a shareable link.

### Issues — `/qa/issues`

The defect lifecycle as one pipeline:

```
Issue created in GitHub → Closed / resolved → Retested by QA → Confirmed by mentor / senior
```

Each row carries a four-dot tracker so you can see where an issue is stuck; a
red ✕ on step 3 means the retest **failed** and the issue went back to the
developer. Clicking a row opens a timeline showing who did what and when — and
for steps that have not happened, *why they are still pending*.

---

## How the data gets in

```
Google Sheet ──(Apps Script onEdit, debounced)──▶ POST /api/sync/webhook
     │                                                    │
     └──(cron every 10 min, full reconcile)──▶ SyncService ┤
                                                          ▼
                              SQLite:  TestCase · TestCaseRevision
                                       QaSnapshot · SyncRun · Issue
                                                          │
                                    /qa (server-rendered) ┴ /api/qa/*
```

The frontend never talks to Google. A server-side sync reads the sheet and
upserts into the database, because:

- **Trend charts need stored history.** A sheet only holds today's state; it can
  never produce yesterday's numbers retroactively.
- **Page loads stay in milliseconds** instead of 400–1500 ms per Sheets call.
- **A Google outage shows stale data with a banner**, not an error page.
- **Clients never touch the sheet** — no sharing the source document, no
  exposure of internal notes.

### Connecting the Google Sheet

1. Create a Google Cloud service account, enable the **Sheets API**.
2. Share the QA sheet with the service account e-mail as **Viewer** — read-only,
   so the dashboard can never corrupt QA's work.
3. Put the service-account JSON (base64, one line) in `GOOGLE_SERVICE_ACCOUNT_KEY`
   and the sheet id in `QA_SHEET_ID`.
4. `npm run sync`

### Keeping it in sync

**Full reconcile every 10 minutes** — the only trigger that can detect rows
*deleted* from the sheet:

```jsonc
// vercel.json
{ "crons": [{ "path": "/api/sync/run?trigger=cron", "schedule": "*/10 * * * *" }] }
```

```powershell
# Windows Task Scheduler
schtasks /create /sc minute /mo 10 /tn QAmateSync ^
  /tr "curl -X POST http://localhost:3000/api/sync/run?trigger=cron"
```

**Near-instant updates while QA works** — an Apps Script `onEdit` webhook. The
script to paste into the sheet is in the comment block at the top of
`src/app/api/sync/webhook/route.ts`. Set `SYNC_WEBHOOK_SECRET` to the same value
in both places; calls are HMAC-signed.

The webhook runs a *partial* sync — it sees the sheet mid-edit and must never
conclude that unseen rows were deleted. Deletions are the cron's job, and they
are **soft** deletes: an accidental row deletion in the sheet stays recoverable.

### Connecting GitHub

Set `GITHUB_TOKEN` (fine-grained PAT, read access to Issues) and `GITHUB_REPO`.

The link between a test case and an issue is the sheet's **Defect ID** column —
write `#412`, `412` or the full issue URL and the app pulls that issue's real
title, state, assignee and close date.

The QA half of the lifecycle is not something GitHub knows, so it comes from
labels and comments — which keeps QA in one tool:

| Signal | Meaning |
|---|---|
| label `qa:retest-passed` / `qa:retest-failed` | retest outcome |
| label `qa:confirmed` | senior / mentor sign-off |
| label `severity:critical\|high\|medium\|low` | severity |
| comment starting `QA RETEST:` | retest note, dated, attributed to the commenter |
| comment starting `QA CONFIRMED:` | sign-off note, dated, attributed |
| label `qa` | include an issue even before its number is in the sheet |

Without a token the tab shows 16 worked examples with a banner saying so.

---

## Metric definitions

Printed here and on the dashboard, because a client-facing figure without a
definition is a figure that gets argued about.

| Metric | Formula |
|---|---|
| In-scope cases | `total − N/A` |
| **Executed** | `Pass + Fail` — Blocked and Retest are *outstanding*, not done |
| Test execution % | `Executed / In-scope` |
| Pass % | `Pass / Executed` — never over the full suite, which understates quality early |
| Failure % | `Fail / Executed` |
| Automation coverage % | `Automated / (Manual + Automated)` |
| Open risk | `Fail + Blocked + Retest` |
| **QA health score** | `0.40 × Pass% + 0.35 × Execution% + 0.25 × (100 − OpenRisk/InScope × 100)` |

Execution is weighted at 35% deliberately. A suite where two cases ran and both
passed is not "100% healthy" — it is untested. The score can only reach the 90s
when the suite has actually been worked through, which is the message a client
needs.

Bands: 85–100 Strong · 70–84 On track · 50–69 Needs execution · <50 At risk.

---

## Data validation

The sync never rejects a row for being imperfect — the sheet is the source of
truth. It imports and **warns**, and warnings are internal only; clients see
whatever the sheet says.

| Rule | On violation |
|---|---|
| TC-ID present and well-formed | skip row, warn |
| Status is one of the `Lists` values | import as *Not Run*, warn |
| Type / Priority in `Lists` | import as-is, warn about dropdown drift |
| Pass/Fail with no Execution Date | import, warn |
| Pass/Fail with no Tester | import, warn |
| **Actual Result present but Status is *Not Run*** | import, warn |
| Fail with no Defect ID | import, warn |
| Execution Date in the future | import, warn |
| Row vanished from the sheet | soft delete, warn |

Three issues already present in the sample workbook, which these rules catch:

1. **`Edge` (25 cases) and `Build` (1)** are used in the Type column but are not
   in the `Lists` tab — the dropdown has drifted from the data.
2. **PORTAL-008, PORTAL-009, ONB-006, ONB-009, MKT-005** carry a written Actual
   Result but are still marked *Not Run*, with no tester and no date. They are
   silently missing from the executed count — the true execution figure is 55,
   not 50.
3. **Defect ID is empty across all 298 rows**, so the Issues tab and defect
   trends run on seed data until QA starts recording issue keys.

---

## Rules for the QA team

The dashboard is only as good as the sheet.

1. **Never rename the header row or the tabs.** The importer maps by header
   name; a rename aborts the sync *by design* rather than importing wrong data.
2. **Set Status from the dropdown, always.** Free text imports as *Not Run* and
   quietly understates progress.
3. **Fill Execution Date and Tester whenever Status changes.** They drive the
   trend, the activity feed and the date filter.
4. **Record a Defect ID on every Fail.** This is what populates the Issues tab.
5. **Keep `Lists` in step with reality** — add `Edge` and `Build` to the Type
   list, or re-tag those 26 cases.

One optional column with outsized value: add **`Cycle`** (or `Sprint`) to each
tab. It costs one dropdown per row and unlocks cycle-over-cycle comparison,
regression-run tracking and per-release quality reporting.

---

## Project layout

```
prisma/schema.prisma           TestCase · TestCaseRevision · QaSnapshot · SyncRun · Issue
scripts/seed.ts                first-run seed
scripts/sync-once.ts           one full sync from the CLI
src/lib/constants.ts           every enum, the health formula, stage derivation
src/lib/sheets.ts              Sheets client, parser, validation rules
src/lib/sync.ts                upsert · content hashing · soft delete · snapshots
src/lib/github.ts              issue fetch + QA lifecycle from labels/comments
src/lib/metrics.ts             every number the dashboard shows, defined once
src/app/qa/…                   Summary · Cases · Issues
src/app/api/…                  summary · cases · issues · trends · activity · export · sync
src/components/…               AppShell · Summary · CaseTable · CaseDrawer · IssueBoard · IssueDrawer · ui
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/qa/summary` | every KPI, module rollup, coverage, health score, sync state |
| `GET /api/qa/cases` | paginated, filterable case list |
| `GET /api/qa/issues` | issues + lifecycle pipeline counts |
| `GET /api/qa/trends?days=90` | snapshot series for trend charts |
| `GET /api/qa/activity?limit=25` | recent status changes |
| `GET /api/qa/export?format=csv&…` | current filtered view as CSV |
| `POST /api/sync/run` | manual / cron sync (full reconcile) |
| `POST /api/sync/webhook` | Apps Script entry point (partial, HMAC-signed) |

## Moving to PostgreSQL

Change the datasource in `prisma/schema.prisma` to `provider = "postgresql"`,
point `DATABASE_URL` at your instance, and run `npx prisma db push`. No model
changes are needed.

## Design notes

- **Status colour is the only strong colour on the page.** Chrome stays a cool
  near-neutral so the status band carries all the signal.
- **Every status is colour *and* label**, never colour alone — it has to survive
  colour-blind readers, greyscale printing and a bad projector.
- **Progress out-ranks pass rate.** At 17% executed with a 98% pass rate, a
  layout that leads with pass rate misleads.
- **No charting library.** At this data density it costs 90–200 KB and gives
  back less theming and accessibility control than it takes.
- Full light and dark theming from one token set in `src/app/globals.css`.
- Below 600px the case table becomes stacked cards — a nine-column table is
  unusable on a phone, and clients read these on phones.
