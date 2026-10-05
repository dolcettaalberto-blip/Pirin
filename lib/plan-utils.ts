import { simulateCtl } from "./ctl";
import { addDays, daysBetween, weekdayKey } from "./dates";
import type { Plan, PlanWeek } from "./schemas";

export type DailyLoad = { date: string; load: number };
export type CtlPoint = { date: string; ctl: number };

/**
 * Expand the plan's weekly `plannedDailyLoad` maps into a per-date load series,
 * from the day after `baseline.date` up to but NOT including race day. Weeks run
 * Mon -> Sun; each date maps to `plannedDailyLoad[weekday(date)]` of its week.
 *
 * Race day is deliberately excluded: the race is the outcome the plan builds
 * towards, not an input that builds fitness. Feeding its load (~360) into the
 * 42-day CTL recurrence would add ~+7 on the final day and make the trajectory
 * chart end on a spike that says nothing about race readiness.
 */
export function expandDailyLoads(plan: Plan): DailyLoad[] {
  const out: DailyLoad[] = [];
  const raceDate = plan.race.date;
  for (const week of plan.weeks) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(week.start, i);
      if (date <= plan.baseline.date || date >= raceDate) continue;
      out.push({ date, load: week.plannedDailyLoad[weekdayKey(date)] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Close a CTL series at race day with the fitness carried to the start line —
 * the value after the last pre-race training day. Keeps the chart running to
 * race day without the race itself moving the line.
 */
function withStartLinePoint(series: CtlPoint[], raceDate: string): CtlPoint[] {
  const last = series.at(-1);
  if (!last || last.date >= raceDate) return series;
  return [...series, { date: raceDate, ctl: last.ctl }];
}

/** Simulated CTL series for a plan, starting at the baseline (which is included as the first point). */
export function plannedCtlSeries(plan: Plan): CtlPoint[] {
  const loads = expandDailyLoads(plan);
  const ctls = simulateCtl(plan.baseline.ctl, loads.map((d) => d.load));
  return withStartLinePoint(
    [
      { date: plan.baseline.date, ctl: plan.baseline.ctl },
      ...loads.map((d, i) => ({ date: d.date, ctl: ctls[i] })),
    ],
    plan.race.date
  );
}

/**
 * Project CTL forward from a known (date, ctl) point using the plan's remaining
 * daily loads, at 100% compliance. The starting point is included.
 */
export function projectedCtlSeries(plan: Plan, fromDate: string, fromCtl: number): CtlPoint[] {
  const loads = expandDailyLoads(plan).filter((d) => d.date > fromDate);
  const ctls = simulateCtl(fromCtl, loads.map((d) => d.load));
  return withStartLinePoint(
    [{ date: fromDate, ctl: fromCtl }, ...loads.map((d, i) => ({ date: d.date, ctl: ctls[i] }))],
    plan.race.date
  );
}

export function raceDayCtl(series: CtlPoint[], raceDate: string): number | null {
  const pt = series.filter((p) => p.date <= raceDate).at(-1);
  return pt ? pt.ctl : null;
}

export type RampWarning = { week: number; start: string; ramp: number };

/** True for the week containing race day — its spikes are the race, not training risk. */
function isRaceWeek(plan: Plan, week: PlanWeek): boolean {
  return plan.race.date >= week.start && plan.race.date <= addDays(week.start, 6);
}

function isRecoveryWeek(week: PlanWeek | undefined): boolean {
  return week != null && /recovery/i.test(week.block);
}

/**
 * Weeks (among those ending after `fromDate`) whose simulated CTL ramp exceeds 6/wk.
 *
 * This is the only load guardrail: it is on effort (CTL), not on vertical. It is
 * bent for recovery weeks: the week straight after a recovery week is measured from
 * the CTL before the recovery week started, so rebounding to pre-recovery fitness
 * is not flagged as a ramp. `history` (actual CTL points) lets that baseline sit in
 * the past; without it the check falls back to the plain week-over-week ramp.
 */
export function rampWarnings(
  plan: Plan,
  series: CtlPoint[],
  fromDate: string,
  history: CtlPoint[] = []
): RampWarning[] {
  const byDate = new Map([...history, ...series].map((p) => [p.date, p.ctl]));
  const warnings: RampWarning[] = [];
  plan.weeks.forEach((week, i) => {
    const weekEnd = addDays(week.start, 6);
    if (weekEnd <= fromDate || isRaceWeek(plan, week)) return;
    const prev = plan.weeks[i - 1];
    const plainStart = byDate.get(addDays(week.start, -1));
    const startCtl = isRecoveryWeek(prev)
      ? byDate.get(addDays(prev.start, -1)) ?? plainStart
      : plainStart;
    const endCtl = byDate.get(weekEnd) ?? byDate.get(plan.race.date);
    if (startCtl === undefined || endCtl === undefined) return;
    const ramp = endCtl - startCtl;
    if (ramp > 6) warnings.push({ week: week.week, start: week.start, ramp });
  });
  return warnings;
}

/** The plan week containing `date`, if any. */
export function weekFor(plan: Plan, date: string): PlanWeek | null {
  return (
    plan.weeks.find((w) => {
      const offset = daysBetween(w.start, date);
      return offset >= 0 && offset < 7;
    }) ?? null
  );
}

export function plannedLoadFor(plan: Plan, date: string): number | null {
  const week = weekFor(plan, date);
  return week ? week.plannedDailyLoad[weekdayKey(date)] : null;
}
