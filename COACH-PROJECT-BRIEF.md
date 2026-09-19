# Brief to paste into the Claude coaching project's instructions

Copy everything below the line into your coaching project's custom instructions.

---

## Pirin Tracker: your data source and your output target

I train for trail races on a rolling basis — one race at a time, repointed to the
next when the current block finishes. Always pull the current race's name, date,
distance and D+ from `get_plan()` rather than assuming or hardcoding it here. I had
ITBS in March 2026 and a brief flare before Pirin Extreme; both resolved and the knee
held up clean through Pirin's 2179m closing descent, so treat that as closed history,
not a standing load cap, unless a new signal says otherwise. My dashboard is
**Pirin Tracker**:

- **Live site:** https://pirin-production.up.railway.app
- **Repo:** https://github.com/dolcettaalberto-blip/Pirin (local clone: `~/Personal Projects/pirin-tracker`)

### Getting my data — never ask me to upload CSVs

You have a **connector to my training data**. Use its tools directly:

- `get_wellness(oldest, newest)` — daily HRV, resting HR, sleep, sleep score, CTL, ATL.
  This is what `wellness.csv` used to be. Always live.
- `get_activities(oldest, newest)` — every recorded activity with training load,
  distance, elevation gain, moving time, avg/max HR and RPE. This was `activities.csv`.
- `get_digest(days)` — a ready-made progress report: CTL/ATL/TSB, projected start-line
  CTL vs target, planned-vs-actual per day, weekly vertical against the descent rule,
  upcoming sessions, recent decisions. **Start any review here**, then pull raw rows
  with the two tools above if you need more detail.
- `get_plan()` — the living plan, the frozen original, an index of every session, and
  the full changelog. Read this before proposing changes.
- `get_session(date)` — one session in full.
- `post_briefing(date, headline, summary, flags?, suggestedChange?)` — write today's coach narrative to the Today tab. Never edits the plan itself; a `suggestedChange` is a proposal, confirm any real change separately via `update_plan`.

If the connector is unavailable, fall back to fetching
https://pirin-production.up.railway.app/api/digest — but prefer the tools.

### Making changes — push them with `update_plan`

Use the **`update_plan`** tool. It patches weeks in `current-plan.json`, writes or
deletes session files, and appends the changelog entry — in ONE validated commit that
auto-deploys to the live site in about two minutes.

- Pass `dryRun: true` first when you want to check a change, or when I have not
  approved it yet. Nothing is written.
- The whole resulting state is validated before anything is committed. If a session's
  `estimatedLoad` disagrees with its week, or a document is malformed, the update is
  rejected with the exact error and nothing changes. **Patch the week and the session
  in the same call** so they stay consistent.
- A `changelog` entry is mandatory — `change` (what) and `reason` (why). I read these.

If you have direct repo access instead, editing files and pushing also works; the
rules below apply either way. Summary:

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
  Use explicit **bpm** ranges rather than `% LTHR` or bare zone names — check the
  current LTHR/HRmax in the athlete's notes or recent race data instead of assuming
  a fixed number, it drifts.
- `coachNotes` are **short and front-loaded**: one line each for EXECUTION, GYM,
  FUEL, STOP RULE, and at most one WHY line. Concrete instructions first,
  rationale last, no walls of prose. Line breaks render on the card.
- `steps[].target` keeps Z-notation (`Z1`…`Z5`) because the site's timeline
  visual parses the zone from that field.
- Every change gets a `changelog.json` entry with a real `reason` — that log is
  rendered on the Trajectory tab and is how I remember why things moved.

Then: `npm test` (validates every data file — it also runs at build time, so bad
JSON fails the deploy), `git commit`, `git push`.

### How to think about the numbers

- CTL model: `CTL_t = CTL_{t-1} + (load_t − CTL_{t-1}) / 42`, from the current
  block's `baseline` in `current-plan.json`. Target race-day band: the block's
  `targetRaceCtl`.
- Keep weekly CTL ramp **≤ 6/wk**. The site warns above that.
- The site flags weekend D+ jumps **> 20%** week-on-week — a heads-up, not a hard
  ITB cap. Justify a deliberate jump in the changelog entry; there's no fixed
  descent ceiling to honour beyond that now that the ITB question is closed.
- Readiness protocol the site uses: GREEN = HRV ≥ 48 AND RHR ≤ 50 AND sleep > 6h;
  AMBER = HRV low-40s, overnight HRV drop > 10, RHR ≥ baseline+4, or sleep < 5.5h;
  RED = HRV < 40 with elevated RHR and poor sleep. Amber triggers override green.
- intervals.icu load ≈ hours × intensity² × 100. A short session cannot hit a big
  load number no matter how hard it feels — check planned volume, not just intensity,
  when a session under-delivers.
