# Pirin Tracker

Mobile-first training dashboard for trail-race training blocks — currently **Valtellina Wine Trail (Half)**, 7 Nov 2026 (21.7 km / 914 m D+). Repoints to the next race when a block finishes (see `data/SCHEMA.md`).
Single view of: today's readiness + session, the current week, and CTL trajectory vs plan.

- **Live fitness data:** intervals.icu API (wellness + activities), fetched server-side only, cached 1 h.
- **Plan data:** JSON files in [`/data`](data/) — edited by a Claude coaching project; schema and update
  workflow documented in [`data/SCHEMA.md`](data/SCHEMA.md). Push to `main` → Railway redeploys.
- **The only write:** the "Send to watch" button, which creates a WORKOUT event on the intervals.icu
  calendar (syncs to Garmin Connect automatically as a structured workout).

## Stack

Next.js (App Router) · TypeScript · Tailwind · Recharts · zod · vitest. PWA (installs to home screen).

## Local dev

```bash
cp .env.example .env.local   # fill in ICU_API_KEY + ICU_ATHLETE_ID
npm install
npm run dev
```

Without intervals.icu credentials the app still runs: plan/session/trajectory-projection render from
the repo data; readiness and actuals show as "not connected".

`npm test` runs the CTL-formula unit tests, readiness-protocol tests, and **data validation** —
the same suite runs at the start of `npm run build`, so malformed `/data` JSON fails the deploy loudly.

## Deploying to Railway

1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub repo → select it. Railway detects Next.js and uses
   `npm run build` / `npm run start`.
3. Set service variables: `ICU_API_KEY`, `ICU_ATHLETE_ID` (and optionally `APP_TIMEZONE`,
   default `Europe/Rome`).
4. Enable auto-deploy on push to `main` (default). Generate a domain under Settings → Networking.

## Claude connector (MCP)

`POST /api/mcp` is a Model Context Protocol server, so Claude can query intervals.icu
and change the plan by being asked, instead of you downloading CSVs. Six tools:

| Tool | What it does |
|---|---|
| `get_wellness(oldest, newest)` | Daily HRV / RHR / sleep / CTL / ATL — replaces `wellness.csv` |
| `get_activities(oldest, newest)` | Activities with load, distance, D+, HR, RPE — replaces `activities.csv` |
| `get_digest(days)` | The full analysis digest (same content as `/api/digest`) |
| `get_plan()` | Living plan, frozen plan, session index, changelog |
| `get_session(date)` | One session in full |
| `update_plan({...})` | Patch weeks, write/delete sessions, append changelog — one validated commit |

Reads bypass the hourly cache, so an agent always sees current data.

`update_plan` validates the **entire resulting state** before committing (schemas,
Monday week starts, `estimatedLoad` matching `plannedDailyLoad`, frozen
`race`/`baseline`/`targetRaceCtl`). If anything fails, nothing is committed and the
errors come back. Pass `dryRun: true` to preview without writing. It reads
`current-plan.json` and `changelog.json` from the branch HEAD rather than the running
container, so it cannot revert a change that has not redeployed yet.

Auth: `Authorization: Bearer $MCP_TOKEN`, or `?key=$MCP_TOKEN` for clients that only
accept a URL. Without `MCP_TOKEN` set the endpoint returns 401 for everything.

Add it to Claude Code with:

```bash
claude mcp add --transport http pirin "https://pirin-production.up.railway.app/api/mcp" --header "Authorization: Bearer YOUR_MCP_TOKEN"
```

## Structure

| Path | What |
|---|---|
| `app/page.tsx` | **Today** — readiness traffic light, session card with intensity timeline, CTL/ATL/TSB strip |
| `app/week/page.tsx` | **Week** — 7-day list, planned vs actual load bars |
| `app/trajectory/page.tsx` | **Trajectory** — plan / actual / projected CTL chart, weekend D+ chart, coach changelog |
| `app/api/icu/*` | intervals.icu proxy routes (key stays server-side) + the send-workout POST |
| `lib/` | CTL math, plan expansion, readiness protocol, zod schemas, intervals.icu client |
| `data/` | plan.json (frozen) · current-plan.json (living) · sessions/ · changelog.json · SCHEMA.md |
| `tests/` | CTL hand-computed simulation, readiness protocol, build-time data validation |

## Readiness protocol

GREEN = HRV ≥ 48 AND RHR ≤ 50 AND sleep > 6 h → "Train as planned".
AMBER = HRV low-40s, overnight HRV drop > 10, RHR ≥ 30-day baseline + 4, or sleep < 5.5 h → "Cut 25%, no descent".
RED = HRV < 40 with elevated RHR and poor sleep → "Easy 30m flat or rest".
Amber triggers override green thresholds (they're deviations from personal baseline).

## CTL model

`CTL_t = CTL_{t-1} + (load_t − CTL_{t-1}) / 42`, simulated from the current block's baseline
(`data/current-plan.json` → `baseline`). Grey dashed = frozen `plan.json`; solid = intervals.icu
actuals; dotted = projection from today's actual CTL over `current-plan.json` remaining loads at
100% compliance. Target band: the block's `targetRaceCtl`, shown on the Trajectory tab.
