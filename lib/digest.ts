import { loadChangelog, loadCurrentPlan, loadOriginalPlan, loadSession } from "./data";
import { addDays, formatWeekday, todayIso, weekdayKey } from "./dates";
import { getActivities, getWellness, icuConfigured, type Activity, type Wellness } from "./icu";
import {
  plannedCtlSeries,
  projectedCtlSeries,
  raceDayCtl,
  rampWarnings,
  weekFor,
} from "./plan-utils";

export type DigestOptions = { days?: number };

function n(v: number | null | undefined, digits = 0): string {
  return v == null ? "–" : v.toFixed(digits);
}

function hours(secs: number | null | undefined): string {
  if (secs == null) return "–";
  return `${Math.floor(secs / 3600)}h${Math.round((secs % 3600) / 60)
    .toString()
    .padStart(2, "0")}`;
}

function activitySummary(a: Activity): string {
  const bits: string[] = [];
  if (a.distance) bits.push(`${(a.distance / 1000).toFixed(1)}km`);
  if (a.total_elevation_gain) bits.push(`${Math.round(a.total_elevation_gain)}m D+`);
  if (a.moving_time) bits.push(hours(a.moving_time));
  if (a.average_heartrate) bits.push(`${Math.round(a.average_heartrate)}bpm avg`);
  if (a.max_heartrate) bits.push(`${Math.round(a.max_heartrate)}bpm max`);
  if (a.icu_rpe != null) bits.push(`RPE ${a.icu_rpe}`);
  return bits.join(", ");
}

/**
 * Everything the coaching project used to get from manually downloaded
 * wellness.csv + activities.csv, plus the plan context those CSVs lacked:
 * planned-vs-actual per day, adherence, trajectory and upcoming sessions.
 */
export async function buildDigest(options: DigestOptions = {}): Promise<string> {
  const days = Math.min(Math.max(options.days ?? 21, 1), 400);
  const today = todayIso();
  const since = addDays(today, -days);

  const original = loadOriginalPlan();
  const current = loadCurrentPlan();
  const changelog = loadChangelog();

  const [wellnessRaw, activitiesRaw] = await Promise.all([
    getWellness(since, today),
    getActivities(since, today),
  ]);

  const out: string[] = [];
  const push = (s = "") => out.push(s);

  push(`# Pirin Tracker digest — generated ${today}`);
  push();
  push(
    `Race: **${original.race.name}**, ${original.race.date} (${original.race.distanceKm}km / ${original.race.dPlus}m D+). ` +
      `Days to race: **${Math.round(
        (Date.parse(`${original.race.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
      )}**.`
  );
  push();
  if (!icuConfigured()) {
    push("> intervals.icu is NOT configured on this deployment — live data below is empty.");
    push();
  }

  const wellness = (wellnessRaw ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  const activities = (activitiesRaw ?? [])
    .slice()
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));

  // ---- Fitness state -------------------------------------------------------
  const latest = [...wellness].reverse().find((w) => w.ctl != null) ?? null;
  const latestAtl = [...wellness].reverse().find((w) => w.atl != null) ?? null;
  push("## Current fitness state");
  push();
  if (latest) {
    const ctl = latest.ctl as number;
    const atl = latestAtl?.atl ?? null;
    push(`- As of ${latest.id}: **CTL ${n(ctl, 1)}**, ATL ${n(atl, 1)}, TSB ${atl != null ? n(ctl - atl, 1) : "–"}`);
  } else {
    push("- No CTL data available from intervals.icu.");
  }
  const projStart = latest ? { date: latest.id, ctl: latest.ctl as number } : { date: current.baseline.date, ctl: current.baseline.ctl };
  const projected = projectedCtlSeries(current, projStart.date, projStart.ctl);
  const projRace = raceDayCtl(projected, current.race.date);
  const planRace = raceDayCtl(plannedCtlSeries(original), original.race.date);
  if (projRace != null) {
    const delta = projRace - current.targetRaceCtl;
    push(
      `- Projected **start-line** CTL (current plan, 100% compliance): **${n(projRace, 1)}** ` +
        `vs target ${current.targetRaceCtl} (${delta >= 0 ? "+" : ""}${n(delta, 1)}). ` +
        `Original plan projected ${n(planRace, 1)}.`
    );
    push(
      `- Race day (${current.race.date}) is excluded from the CTL simulation — the race is the ` +
        `outcome, not a fitness input. Its load never enters the projection.`
    );
  }
  const warnings = rampWarnings(current, projected, today);
  if (warnings.length > 0) {
    push(
      `- ⚠ CTL ramp >6/wk upcoming: ${warnings
        .map((w) => `Wk${w.week} +${n(w.ramp, 1)}`)
        .join(", ")}`
    );
  }
  push();

  // ---- Wellness table ------------------------------------------------------
  push(`## Wellness — last ${days} days (from intervals.icu)`);
  push();
  push("| date | day | HRV | RHR | sleep | sleepScore | readiness | CTL | ATL |");
  push("|---|---|---|---|---|---|---|---|---|");
  for (const w of wellness) {
    push(
      `| ${w.id} | ${formatWeekday(w.id)} | ${n(w.hrv)} | ${n(w.restingHR)} | ${hours(w.sleepSecs)} | ` +
        `${n(w.sleepScore)} | ${n(w.readiness)} | ${n(w.ctl, 1)} | ${n(w.atl, 1)} |`
    );
  }
  if (wellness.length === 0) push("| _no data_ | | | | | | | | |");
  push();

  const hrvs = wellness.filter((w) => w.hrv != null).map((w) => w.hrv as number);
  const rhrs = wellness.filter((w) => w.restingHR != null).map((w) => w.restingHR as number);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  push(
    `Baselines over this window: HRV mean ${n(mean(hrvs), 1)} (last ${n(hrvs.at(-1), 0)}), ` +
      `RHR mean ${n(mean(rhrs), 1)} (last ${n(rhrs.at(-1), 0)}).`
  );
  push();

  // ---- Planned vs actual, day by day --------------------------------------
  push(`## Planned vs actual — last ${days} days`);
  push();
  push("| date | day | session (plan) | planned load | actual load | recorded |");
  push("|---|---|---|---|---|---|");
  const actsByDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const d = a.start_date_local.slice(0, 10);
    actsByDate.set(d, [...(actsByDate.get(d) ?? []), a]);
  }
  let plannedSum = 0;
  let actualSum = 0;
  for (let d = since; d <= today; d = addDays(d, 1)) {
    const week = weekFor(current, d);
    const planned = week ? week.plannedDailyLoad[weekdayKey(d)] : null;
    const session = loadSession(d);
    const acts = actsByDate.get(d) ?? [];
    const actual = acts.reduce((s, a) => s + (a.icu_training_load ?? 0), 0);
    plannedSum += planned ?? 0;
    actualSum += actual;
    const recorded = acts.length
      ? acts.map((a) => `${a.name ?? a.type ?? "activity"} (load ${n(a.icu_training_load)}; ${activitySummary(a)})`).join(" + ")
      : "—";
    push(
      `| ${d} | ${formatWeekday(d)} | ${session ? session.title : planned === 0 ? "rest" : "—"} | ` +
        `${planned ?? "–"} | ${acts.length ? Math.round(actual) : "–"} | ${recorded} |`
    );
  }
  push();
  push(
    `Window totals: planned ${Math.round(plannedSum)}, actual ${Math.round(actualSum)} ` +
      `(${plannedSum > 0 ? Math.round((actualSum / plannedSum) * 100) : 0}% of planned load).`
  );
  push();

  // ---- Descent load (the injury axis) -------------------------------------
  push("## Weekly vertical (ITB / descent-ramp watch)");
  push();
  push("| week | block | planned weekendDplus | actual D+ (all activities) | actual load | planned load |");
  push("|---|---|---|---|---|---|");
  for (const w of current.weeks) {
    const end = addDays(w.start, 6);
    if (end < since && w.start < since) continue;
    const inWeek = activities.filter((a) => {
      const d = a.start_date_local.slice(0, 10);
      return d >= w.start && d <= end;
    });
    if (inWeek.length === 0 && w.start > today) continue;
    const dplus = inWeek.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0);
    const load = inWeek.reduce((s, a) => s + (a.icu_training_load ?? 0), 0);
    const plannedLoad = Object.values(w.plannedDailyLoad).reduce((s, v) => s + v, 0);
    // Actuals only cover the digest window, so a week straddling either edge is
    // under-counted — say so rather than letting it read as a real shortfall.
    const partial = w.start < since ? " _(partial: window starts mid-week)_" : end > today ? " _(in progress)_" : "";
    push(
      `| Wk${w.week} (${w.start})${partial} | ${w.block} | ${w.weekendDplus} | ${Math.round(dplus)} | ` +
        `${Math.round(load)} | ${plannedLoad} |`
    );
  }
  push();
  push(
    "Note: `weekendDplus` counts the contiguous mountain block (Fri-Sun where applicable), " +
      "not strictly Sat+Sun — see the changelog entry of 2026-07-26."
  );
  push();

  // ---- Upcoming ------------------------------------------------------------
  push("## Upcoming sessions (next 10 days, from current-plan.json)");
  push();
  for (let i = 0; i <= 10; i++) {
    const d = addDays(today, i);
    if (d > current.race.date) break;
    const week = weekFor(current, d);
    const planned = week ? week.plannedDailyLoad[weekdayKey(d)] : null;
    const s = loadSession(d);
    if (!s) {
      push(`- **${d} (${formatWeekday(d)})** — ${planned === 0 ? "rest" : `no session file, planned load ${planned ?? "–"}`}`);
      continue;
    }
    push(`- **${d} (${formatWeekday(d)})** — ${s.title} [${s.type}], load ${s.estimatedLoad}${s.terrain ? `, ${s.terrain}` : ""}`);
    if (s.coachNotes) push(`  - notes: ${s.coachNotes}`);
    push(`  - watch: \`${s.icuWorkoutText.replace(/\n/g, " | ")}\``);
  }
  push();

  // ---- Recent coach decisions ---------------------------------------------
  push("## Recent coach decisions (changelog, newest first)");
  push();
  for (const e of [...changelog].reverse().slice(0, 8)) {
    push(`- **${e.date}** — ${e.change}`);
    push(`  - why: ${e.reason}`);
    push(`  - affects: ${e.affects.join(", ")}`);
  }
  push();

  return out.join("\n");
}

/** The prompt the coaching project receives, with the digest embedded. */
export function reviewPrompt(digest: string, digestUrl: string): string {
  return [
    "You are my running coach for Pirin Extreme. Below is an auto-generated digest of my",
    "current intervals.icu data (wellness + activities) and my plan state, straight from",
    "the Pirin Tracker app. It replaces the wellness.csv/activities.csv I used to upload.",
    "",
    "Please review my progress and give me feedback:",
    "",
    "1. **Readiness trend** — HRV/RHR/sleep over the window. Anything I should act on?",
    "2. **Adherence** — where actual load diverged from planned, and whether that matters.",
    "3. **Descent load** — my ITB risk axis. Is the vertical ramp safe?",
    "4. **Trajectory** — am I on track for the race-day CTL target? If not, what changes?",
    "5. **The next 7 days** — concrete adjustments, if any.",
    "",
    "If you decide to change the plan, apply it the usual way: edit `data/current-plan.json`",
    "and the affected `data/sessions/*.json`, append to `data/changelog.json`, commit and push.",
    "Follow `data/SCHEMA.md` exactly.",
    "",
    `You can always refetch a fresh version of this digest at: ${digestUrl}`,
    "",
    "---",
    "",
    digest,
  ].join("\n");
}
