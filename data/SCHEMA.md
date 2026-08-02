# Data schemas & update workflow

This directory is the **plan data source** for Pirin Tracker. It is edited by a
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

`race.date` (**2026-09-12**, Saturday — verified against the official schedule)
is excluded from the CTL simulation entirely. Whatever `plannedDailyLoad` that
day carries, and whatever the session file says, it never enters the
`CTL_t = CTL_{t-1} + (load − CTL_{t-1})/42` recurrence. The trajectory chart's
final point is the **start-line CTL**: the fitness carried into race morning.

Why: the race's load (~360) would add roughly +7 CTL on the last day, so the
chart would end on a spike that describes the race rather than readiness for it.
For the same reason the race week is skipped by the CTL-ramp warning and the
weekend-D+ jump flag — its numbers are the race course, not a training
progression.

So you may set the race day's load and session honestly (load 360, `type:
"race"`, the real course profile) without distorting the projection. Do that
rather than zeroing it.

**`race` is the one field in frozen `plan.json` you may correct.** It describes a
real event, not a plan decision, so if the date or distance turns out to be
wrong, fix it in **both** `plan.json` and `current-plan.json` in the same commit
— the tests require the two to match, and the two chart lines need a shared
x-axis. Never touch anything else in `plan.json`.

## Week/date convention (important)

**Weeks run Monday → Sunday.** Week 1 starts 2026-07-13, a Monday, and every
`start` is 7 days after the previous one. A week covers `[start, start+6]`.
Race day (2026-09-13) is the final Sunday of week 9.

`plannedDailyLoad` keys (`mon`…`sun`) are the calendar weekdays of that week in
order: the load for a given date is `plannedDailyLoad[weekdayOf(date)]` for the
week containing that date. Two special days: week 1's `mon` (2026-07-13) is `0`
because the plan's CTL baseline is dated 2026-07-14 (simulation starts the day
after); and race day (week 9 `sun`) has planned load `0` — the race itself is
not counted as training load in the CTL projection.

## `plan.json` and `current-plan.json`

Identical schema. `plan.json` is frozen; `current-plan.json` is the living plan.

```json
{
  "race": { "name": "Pirin Extreme", "date": "2026-09-13", "distanceKm": 38, "dPlus": 3300 },
  "baseline": { "date": "2026-07-14", "ctl": 27, "atl": 39 },
  "targetRaceCtl": 42,
  "weeks": [
    {
      "week": 1,                       // 1-based, sequential
      "start": "2026-07-13",           // ISO date, always a Monday
      "block": "Consolidate",          // free text: Consolidate | Build | Recovery | Peak | Taper | Race
      "runKm": 44,                     // planned weekly running volume
      "weekendDplus": 1400,            // planned Sat+Sun vertical gain, metres
      "plannedDailyLoad": { "mon": 0, "tue": 35, "wed": 0, "thu": 55, "fri": 20, "sat": 90, "sun": 60 }
    }
  ]
}
```

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
  like `Z1-Z2`) when there is one — the timeline visual parses the zone from it.
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
- Durations: `15m`, `20s`, `1h2m30s`. Targets: zones (`Z1`…`Z5`) or explicit
  HR/pace/power ranges intervals.icu understands (e.g. `94-98% LTHR`).

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
