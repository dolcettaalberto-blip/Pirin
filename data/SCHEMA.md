# Data schemas & update workflow

**Rolling blocks (from 12 Sep 2026).** This app is no longer a single-race
tracker: it carries one training block at a time and is repointed at the next
race when the current one is done. Repointing means rewriting `race`,
`baseline`, `targetRaceCtl` and `weeks` in **both** `plan.json` and
`current-plan.json` in one commit, moving the finished block's session files to
`data/archive/`, and tagging the old state (`git tag <race>-final`) so it stays
recoverable. `changelog.json` is never truncated: entries dated on or before the
current `baseline.date` belong to archived blocks and are exempt from the
plan-window check. `tests/ctl.test.ts` hard-codes the first 14 days and the
race-day CTL band, so it must be retargeted in the same commit.

Current block: **Valtellina Wine Trail (Half)**, 2026-11-07, 21.7km / 914m D+.
Previous block: Pirin Extreme, 2026-09-12 (tag `pirin-final`).

This directory is the **plan data source** for the tracker. It is edited by a
Claude coaching project (via Cowork sessions), not by a human. Everything in this
file is written for that editor: follow it exactly, because **all files are
zod-validated at build time** (`npm test` runs the same validation) and a
malformed file fails the Railway deploy loudly.

## The update loop

After each planning conversation:

1. Edit `current-plan.json` (adjust `plannedDailyLoad`, `runKm`, `weekendDplus` for the affected weeks).
2. Edit or create the affected `sessions/YYYY-MM-DD.json` files.
3. **Append** one entry to `changelog.json` describing the change (never rewrite or delete existing entries).
4. `git commit` + `git push` to `main`. Railway auto-deploys; the site updates in ~2 minutes.

Never edit `plan.json` — it is the frozen original plan, the grey reference line
on the Trajectory chart.

Before committing, run `npm test` if possible. It validates every file in this
directory against the schemas and cross-checks (session filename matches its
`date` field, changelog `affects` dates are valid, etc.).

## The race is not training (important)

`race.date` — whatever the current block's `plan.json` sets it to; check the file
or `get_plan()`, don't assume — is excluded from the CTL simulation entirely.
Whatever `plannedDailyLoad` that day carries, and whatever the session file says,
it never enters the `CTL_t = CTL_{t-1} + (load − CTL_{t-1})/42` recurrence. The
trajectory chart's final point is the **start-line CTL**: the fitness carried
into race morning.

Why: race-day load is typically large enough to add several CTL points on the
last day, so the chart would end on a spike that describes the race rather than
readiness for it. For the same reason race week is skipped by the CTL-ramp
warning and the weekend-D+ jump flag — its numbers are the race course, not a
training progression.

So you may set the race day's load and session honestly (the real load estimate,
`type: "race"`, the real course profile) without distorting the projection. Do
that rather than zeroing it.

**`race` is the one field in frozen `plan.json` you may correct.** It describes a
real event, not a plan decision, so if the date or distance turns out to be
wrong, fix it in **both** `plan.json` and `current-plan.json` in the same commit
— the tests require the two to match, and the two chart lines need a shared
x-axis. Never touch anything else in `plan.json`.

## Week/date convention (important)

**Weeks run Monday → Sunday.** Week 1's `start` is a Monday, and every subsequent
`start` is 7 days after the previous one. A week covers `[start, start+6]`. Race
day falls somewhere in the final week — check `plan.json` for exactly where; it
moves with every repoint.

`plannedDailyLoad` keys (`mon`…`sun`) are the calendar weekdays of that week in
order: the load for a given date is `plannedDailyLoad[weekdayOf(date)]` for the
week containing that date. Two special days, general to every block: the weekday
matching `baseline.date` should carry `0` if that date falls inside week 1 (the
simulation starts the day *after* the baseline, so it isn't double-counted); and
whichever day is race day should carry planned load `0` in `plannedDailyLoad` —
the race's own load lives in its session file instead and is excluded from the
CTL projection (see above), not zeroed there.

## `plan.json` and `current-plan.json`

Identical schema. `plan.json` is frozen; `current-plan.json` is the living plan.

```json
{
  "race": { "name": "Valtellina Wine Trail (Half)", "date": "2026-11-07", "distanceKm": 21.7, "dPlus": 914 },
  "baseline": { "date": "2026-09-13", "ctl": 51, "atl": 76 },
  "targetRaceCtl": 53,
  "weeks": [
    {
      "week": 1,                       // 1-based, sequential
      "start": "2026-09-14",           // ISO date, always a Monday
      "block": "Recovery",             // free text: Consolidate | Build | Recovery | Peak | Taper | Race
      "runKm": 8,                      // planned weekly running volume
      "weekendDplus": 0,               // planned Sat+Sun vertical gain, metres
      "plannedDailyLoad": { "mon": 0, "tue": 0, "wed": 35, "thu": 0, "fri": 35, "sat": 30, "sun": 0 }
    }
  ]
}
```
(This mirrors the live current block — re-check `current-plan.json` for the real values, this is
just shaped like it.)

Rules:
- All 7 weekday keys required, integers ≥ 0. `0` = rest day.
- Don't change `race`, `baseline`, or `targetRaceCtl` in `current-plan.json` —
  they must stay identical to `plan.json` (the tests check this).
- CTL simulation used by the site: `CTL_t = CTL_{t-1} + (load_t − CTL_{t-1}) / 42`,
  starting from `baseline.ctl` on `baseline.date` (the baseline date itself is
  not simulated). Keep weekly CTL ramp ≤ 6/wk or the site shows a warning.

## `sessions/YYYY-MM-DD.json`

One file per non-rest day. The filename date and the `date` field must match.
Rest days (load 0) simply have no file.

```json
{
  "date": "2026-07-23",
  "type": "quality",                   // recovery | easy | quality | long | race
  "title": "Uphill tempo intervals",
  "terrain": "climb only, no descent", // optional free text, shown on the card
  "estimatedLoad": 55,                 // should match plannedDailyLoad for that date
  "steps": [
    { "kind": "warmup", "duration": "15m", "target": "Z1-Z2" },
    { "kind": "repeat", "count": 4, "steps": [
      { "kind": "work", "duration": "2m", "target": "Z4, 8-10% incline" },
      { "kind": "recover", "duration": "1m", "target": "walk" }
    ]},
    { "kind": "recover", "duration": "2m", "note": "between series" },
    { "kind": "cooldown", "duration": "10m", "target": "Z1" }
  ],
  "coachNotes": "Amber rule: cut to 3 reps, no incline change. ITB: zero descent.",
  "icuWorkoutText": "- 15m Z1-Z2\n\n4x\n- 2m Z4\n- 1m Z1\n\n- 10m Z1"
}
```

Step rules:
- `kind`: `warmup` | `work` | `recover` | `cooldown` | `repeat`.
- `repeat` steps have `count` (integer ≥ 1) and nested `steps`; all other kinds
  have `duration` (`"20s"`, `"2m"`, `"1h40m"`, `"2h"`) and usually `target`.
- `target` is free text but should start with the zone (`Z1`…`Z5`, or a range
  like `Z1-Z2`) when there is one, followed by the bpm range (e.g.
  `Z4 at 10-12% incline, 158-169 bpm`) — the timeline visual parses the zone from it.
  `"walk"` renders as rest-colored.
- `estimatedLoad` should equal the day's `plannedDailyLoad` value in
  `current-plan.json`; keep them in sync when adjusting a session.

`icuWorkoutText` is the **exact intervals.icu workout syntax** sent by the
"Send to watch" button (it becomes the workout `description` on the intervals.icu
calendar event, which syncs to Garmin). Keep it consistent with `steps`.

**Syntax (intervals.icu Workout Builder spec — get this exact, it silently
breaks otherwise):**
- One step per `- ` line: `- 15m Z1-Z2`.
- A repeat block's count line is a **bare line with no leading dash**
  (`4x`, not `- 4x`) followed by its steps as plain `- ` lines directly below
  (no extra indentation needed).
- A **blank line is required before and after every repeat block.** Without
  it, or with a `- ` prefix on the count line, intervals.icu fails to parse
  the block as a repeat: it flattens the steps, drops the rep count, and the
  workout that reaches the watch is wrong (this happened for real on
  2026-07-28 — see changelog).
- Nested repeats are not supported. Multiple separate repeat blocks in one
  workout are fine (each needs its own blank-line padding).
- Durations: `15m`, `20s`, `1h2m30s`. Targets: **absolute heart rate in bpm**
  (e.g. `158-169bpm`) — always bpm, never `% LTHR`. LTHR is 175, HRmax 190 (revised 12 Sep 2026 from 2026 race data; the intervals.icu profile still shows a stale 180).

**`coachNotes` style (required):** short and front-loaded. One line each for
`EXECUTION`, `GYM`, `FUEL`, `STOP RULE`, and at most one `WHY` line. Concrete
instructions first, rationale last. Newlines render on the card. No walls of prose.

Correct example matching the `steps` above:
```
- 15m Z1-Z2

4x
- 2m Z4
- 1m Z1

- 10m Z1
```

## `changelog.json`

Append-only array, newest entries appended at the end (the site sorts newest
first for display). Never modify or remove past entries.

```json
{
  "date": "2026-07-19",                 // decision date (ISO)
  "change": "Wk2 Thu uphill tempo cut 5x2m -> 4x2m (planned load 60 -> 55)",
  "reason": "HRV in low 40s Sunday morning; ITB caution",
  "affects": ["2026-07-23"]             // the session dates this changes
}
```

## Full example of one coach adjustment

Amber readiness on 2026-07-22 → cut Thursday's session:

1. `current-plan.json`: week 2 `plannedDailyLoad.thu`: `60` → `55`.
2. `sessions/2026-07-23.json`: repeat `count`: `5` → `4`, `estimatedLoad`: `60` → `55`,
   update `icuWorkoutText` to `- 15m Z1-Z2\n\n4x\n- 2m Z4\n- 1m Z1\n\n- 10m Z1`.
3. `changelog.json`: append the entry shown above.
4. Commit with a message like `coach: cut Wk2 Thu tempo to 4 reps (amber HRV)` and push.

## `data/briefing.json` — daily coach narrative (added for the morning-briefing automation)

Single object, not an array. Overwritten daily — holds only the latest briefing, not a history
(the changelog remains the durable decision log; this is ephemeral daily commentary). Written by
the `post_briefing` MCP tool, never edited by hand.

```json
{
  "date": "2026-09-19",
  "generatedAt": "2026-09-19T04:32:10.000Z",
  "headline": "AMBER — cut tempo to 4 reps",
  "summary": "HRV down 12 from yesterday, RHR +3 over baseline. Sleep was fine. Amber per protocol — not a stop, but no descent intensification today.",
  "flags": ["Second amber morning this week — watch for the grey-zone drift pattern."],
  "suggestedChange": "Cut today's 5x2m tempo to 4x2m, same incline."
}
```

Rules:
- `date`, `headline`, `summary` are required; `flags` defaults to `[]`, `suggestedChange` defaults to `null`.
- The Today page only renders the card when `briefing.date` equals today's date — a stale file from
  a missed run simply disappears rather than showing yesterday's call.
- `suggestedChange` is **informational only**. This tool never writes to `current-plan.json` or a
  session file — that still requires a separate `update_plan` call, which the athlete confirms.

### How `data/briefing.json` gets written day to day

A GitHub Actions workflow (`.github/workflows/morning-briefing.yml`, script in
`.github/scripts/morning-briefing.mjs`) is fired on demand — by the "Generate
briefing" / "Regenerate briefing" button on the Today tab (which POSTs
`/api/briefing/trigger`, a thin wrapper around `dispatchWorkflow()` in
`lib/github.ts`), or manually from the repo's Actions tab. No schedule is set; add a
`schedule:` trigger to the workflow if daily automatic runs are wanted later. Once
fired, it pulls live intervals.icu data, reads `current-plan.json` / today's session /
the changelog, asks the Claude API for a narrative briefing under the same protocol
this project's coaching sessions use, and commits `data/briefing.json` directly with
the Actions-provided token. This runs entirely on GitHub's infrastructure — no Cowork
session or local machine involved. Needs three repo secrets: `ANTHROPIC_API_KEY` and
`ICU_API_KEY` (set already), plus the site's own `GITHUB_TOKEN` (Railway env var,
already used by `update_plan`) needing an added **Actions: write** permission for the
trigger button to be able to dispatch the workflow.
