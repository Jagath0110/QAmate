# QAmate — Oraxs QA Console

A client-facing QA dashboard driven **entirely from the QA team's Google
Sheet** — no database. Two levels: a **QA Summary** (health, progress,
coverage, risk) and the **complete test case list** with search, filters and a
full detail view — plus an **Issues** tab that tracks every failure from
creation through fix, retest and senior sign-off, sourced from an `Issues` tab
in the same spreadsheet.

Built against the real structure of `OraxsHumanManualTestReportv1` — its 19
columns, 7 test tabs, 32 modules and 22 test types.

---

## Run it

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run dev               # http://localhost:3000/qa
```

No setup step, no database. With `.env` empty it loads a captured snapshot of
the workbook — 298 manual cases, 135 automated scenarios, 16 example issues —
so you can see the finished product immediately. Add Google credentials to
`.env` when you want live data; nothing else changes.

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
Issue created → Closed / resolved → Retested by QA → Confirmed by mentor / senior
```

Each row carries a four-dot tracker so you can see where an issue is stuck; a
red ✕ on step 3 means the retest **failed** and the issue went back to the
developer. Clicking a row opens a timeline showing who did what and when — and
for steps that have not happened, *why they are still pending*.

---

## How the data gets in

```
Google Sheet ──(read via googleapis)──▶ in-memory workbook cache (~60s TTL)
                                                    │
                          POST /api/sync/run or /api/sync/webhook
                                    forces an immediate refetch
                                                    │
                                    /qa (server-rendered) ┴ /api/qa/*
```

There is **no database**. Render runs this app as one long-lived Node process,
so a module-level cache (`src/lib/workbook.ts`) is the natural place to hold
the parsed workbook — every page and API route reads from it, never straight
from Google, so a page load costs nothing beyond the cache lookup and a burst
of clicks doesn't burn Sheets API quota.

Trade-off accepted deliberately: **there is no history.** The old
database-backed version stored a daily snapshot for trend charts and a
revision log for an activity feed. A live sheet only ever holds *today's*
state, so both were removed rather than left as permanently-empty features.
"Recently updated" on the Summary page still works — it's sorted by each
case's own Execution Date, not by stored history.

### Connecting the Google Sheet

1. Create a Google Cloud service account, enable the **Sheets API**.
2. Share the QA sheet with the service account e-mail as **Viewer** — read-only,
   so the dashboard can never corrupt QA's work.
3. Put the service-account JSON (base64, one line) in `GOOGLE_SERVICE_ACCOUNT_KEY`
   and the sheet id in `QA_SHEET_ID`.
4. `npm run check:sheet` to verify — reload the app once it passes.

### Keeping it fresh

The in-memory cache refetches on its own after ~60 seconds. To force it
sooner:

**Cron, every 10 minutes** (also the only way to notice rows *deleted* from
the sheet, since a stale cache entry would otherwise just linger until its
next natural refetch):

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

Both routes just invalidate the cache and refetch immediately — there's no
reconciliation to run, since there's no database copy to keep in sync.

### The Issues tab

Add an **`Issues`** tab to the same spreadsheet (same rules as the case tabs:
headers mapped by name, a renamed/missing header aborts the read). 19 columns:

```
Issue ID | Title | Module | Area | Severity | Reporter | Assignee |
Created Date | Resolved Date | Resolution | Retest Date | Retest By |
Retest Result | Retest Note | Confirmed Date | Confirmed By | Confirm Note |
Labels | URL
```

The link to test cases is the case tabs' existing **Defect ID** column — write
the Issue ID there (`1`, `#1`, …) and the app derives which test cases an
issue covers. `Test Case IDs` is never a column on the Issues tab itself, so
QA never enters the same fact twice. `Retest Result` should be `Pass` or
`Fail`; the four-step lifecycle stage is derived from the dates and retest
result, the same logic as before — never stored directly.

Without an `Issues` tab (or without Sheets configured at all) the page shows
16 worked examples with a banner saying so.

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

A row that disappears from the sheet simply disappears from the dashboard on
the next refresh — there's no soft-delete/undo, because there's no database
copy to reconcile against. The sheet itself is the only copy.

Two issues already present in the sample workbook, which these rules catch:

1. **`Edge` (25 cases) and `Build` (1)** are used in the Type column but are not
   in the `Lists` tab — the dropdown has drifted from the data.
2. **PORTAL-008, PORTAL-009, ONB-006, ONB-009, MKT-005** carry a written Actual
   Result but are still marked *Not Run*, with no tester and no date. They are
   silently missing from the executed count — the true execution figure is 55,
   not 50.

---

## Rules for the QA team

The dashboard is only as good as the sheet.

1. **Never rename the header row or the tabs.** The importer maps by header
   name; a rename aborts the sync *by design* rather than importing wrong data.
2. **Set Status from the dropdown, always.** Free text imports as *Not Run* and
   quietly understates progress.
3. **Fill Execution Date and Tester whenever Status changes.** They drive the
   "recently updated" list and the date filter.
4. **Record a Defect ID on every Fail.** This is what populates the Issues tab.
5. **Keep `Lists` in step with reality** — add `Edge` and `Build` to the Type
   list, or re-tag those 26 cases.

One optional column with outsized value: add **`Cycle`** (or `Sprint`) to each
tab. It costs one dropdown per row and unlocks cycle-over-cycle comparison,
regression-run tracking and per-release quality reporting.

---

## Project layout

```
scripts/check-sheet.ts         connection + schema diagnostic (auth, tabs, headers)
src/lib/constants.ts           every enum, the health formula, stage derivation
src/lib/sheets.ts              Sheets client, parser, validation rules
src/lib/workbook.ts            in-memory cache, seed fallback, staleness state
src/lib/metrics.ts             every number the dashboard shows, defined once
src/app/qa/…                   Summary · Cases · Issues
src/app/api/…                  summary · cases · issues · export · sync
src/components/…               AppShell · Summary · CaseTable · CaseDrawer · IssueBoard · IssueDrawer · ui
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/qa/summary` | every KPI, module rollup, coverage, health score, cache state |
| `GET /api/qa/cases` | paginated, filterable case list |
| `GET /api/qa/issues` | issues + lifecycle pipeline counts |
| `GET /api/qa/export?format=csv&…` | current filtered view as CSV |
| `POST /api/sync/run` | invalidate the cache and refetch the sheet now |
| `POST /api/sync/webhook` | Apps Script entry point (HMAC-signed), same refetch |

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
