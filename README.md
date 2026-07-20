# Pirin Tracker

Mobile-first training dashboard for **Pirin Extreme 2026** (13 Sep, 38 km / 3300 m D+).
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

`CTL_t = CTL_{t-1} + (load_t − CTL_{t-1}) / 42`, simulated from the baseline (CTL 27 on 2026-07-14).
Grey dashed = frozen `plan.json`; solid = intervals.icu actuals; dotted = projection from today's
actual CTL over `current-plan.json` remaining loads at 100% compliance. Target band: CTL 40–44 on race day.
