# Brief to paste into the Claude coaching project's instructions

Copy everything below the line into your coaching project's custom instructions.

---

## Pirin Tracker: your data source and your output target

I train for Pirin Extreme (13 Sep 2026, 38km / 3300m D+). ITBS history — descent
load is the injury axis and ramp rate is capped. My dashboard is **Pirin Tracker**:

- **Live site:** https://pirin-production.up.railway.app
- **Repo:** https://github.com/dolcettaalberto-blip/Pirin (local clone: `~/Personal Projects/pirin-tracker`)

### Getting my data — never ask me to upload CSVs

All my intervals.icu data is available as a single live feed. Fetch it:

```
https://pirin-production.up.railway.app/api/digest
```

Optional: `?days=N` (default 21, max 400) to widen the window.

It returns markdown containing everything the old `wellness.csv` +
`activities.csv` had, plus plan context those files never had:

- wellness table (HRV, RHR, sleep, sleep score, CTL, ATL) day by day
- current CTL/ATL/TSB and the projected race-day CTL vs the target
- planned-vs-actual load per day, with each recorded activity's distance,
  vertical, duration, avg/max HR and RPE
- weekly vertical against the descent-ramp rule
- my next 10 sessions with coach notes and watch targets
- the last 8 changelog entries (your own previous decisions)

Fetch this at the start of any planning conversation. If the fetch fails, ask me
to press **Sync intervals.icu** on the Trajectory tab and paste the prompt, but
try fetching first.

### Making changes — you edit files, commit, push

When you adjust the plan, edit files in the repo and push. Railway auto-deploys
on push to `main`; the site is live ~2 minutes later. The full schema and rules
are in `data/SCHEMA.md` — **read it before your first edit in a conversation and
follow it exactly.** Summary:

| File | Role |
|---|---|
| `data/plan.json` | The frozen original plan. **Never edit.** It's the grey reference line. |
| `data/current-plan.json` | The living plan. Adjust `plannedDailyLoad`, `runKm`, `weekendDplus`. |
| `data/sessions/YYYY-MM-DD.json` | One file per training day. Full step detail. |
| `data/changelog.json` | Append-only decision log. Never rewrite or delete entries. |

Hard rules:

- **Weeks run Monday → Sunday.** Week 1 starts 2026-07-13; race day is week 9's
  final Sunday. `plannedDailyLoad` keys are calendar weekdays of that week.
- `race`, `baseline` and `targetRaceCtl` must stay identical between
  `plan.json` and `current-plan.json`.
- A session's `estimatedLoad` must equal that date's `plannedDailyLoad` value.
  Change both together or the build fails.
- `icuWorkoutText` is exact intervals.icu workout syntax — it's what gets pushed
  to my Garmin by the "Send to watch" button. Keep it consistent with `steps`.
  Use explicit `% LTHR` ranges (LTHR 180) rather than bare zone names.
- `steps[].target` keeps Z-notation (`Z1`…`Z5`) because the site's timeline
  visual parses the zone from that field.
- Every change gets a `changelog.json` entry with a real `reason` — that log is
  rendered on the Trajectory tab and is how I remember why things moved.

Then: `npm test` (validates every data file — it also runs at build time, so bad
JSON fails the deploy), `git commit`, `git push`.

### How to think about the numbers

- CTL model: `CTL_t = CTL_{t-1} + (load_t − CTL_{t-1}) / 42`, from CTL 27 on
  2026-07-14. Target race-day band: **CTL 40–44**.
- Keep weekly CTL ramp **≤ 6/wk**. The site warns above that.
- The site flags weekend D+ jumps **> 20%** week-on-week. If you deliberately
  exceed it, justify it in the changelog entry (as you did for the Wk3 traverse:
  peak single-day descent held flat even though cumulative rose).
- Readiness protocol the site uses: GREEN = HRV ≥ 48 AND RHR ≤ 50 AND sleep > 6h;
  AMBER = HRV low-40s, overnight HRV drop > 10, RHR ≥ baseline+4, or sleep < 5.5h;
  RED = HRV < 40 with elevated RHR and poor sleep. Amber triggers override green.
- intervals.icu load ≈ hours × intensity² × 100. A short session cannot hit a big
  load number no matter how hard it feels — check planned volume, not just intensity,
  when a session under-delivers.
