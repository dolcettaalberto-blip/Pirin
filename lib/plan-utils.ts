import { simulateCtl } from "./ctl";
import { addDays, daysBetween, weekdayKey } from "./dates";
import type { Plan, PlanWeek } from "./schemas";

export type DailyLoad = { date: string; load: number };
export type CtlPoint = { date: string; ctl: number };

/**
 * Expand the plan's weekly `plannedDailyLoad` maps into a per-date load series,
 * from the day after `baseline.date` through race day. Weeks run Mon -> Sun;
 * each date maps to `plannedDailyLoad[weekday(date)]` of its containing week.
 */
export function expandDailyLoads(plan: Plan): DailyLoad[] {
  const out: DailyLoad[] = [];
  const raceDate = plan.race.date;
  for (const week of plan.weeks) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(week.start, i);
      if (date <= plan.baseline.date || date > raceDate) continue;
      out.push({ date, load: week.plannedDailyLoad[weekdayKey(date)] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Simulated CTL series for a plan, starting at the baseline (which is included as the first point). */
export function plannedCtlSeries(plan: Plan): CtlPoint[] {
  const loads = expandDailyLoads(plan);
  const ctls = simulateCtl(plan.baseline.ctl, loads.map((d) => d.load));
  return [
    { date: plan.baseline.date, ctl: plan.baseline.ctl },
    ...loads.map((d, i) => ({ date: d.date, ctl: ctls[i] })),
  ];
}

/**
 * Project CTL forward from a known (date, ctl) point using the plan's remaining
 * daily loads, at 100% compliance. The starting point is included.
 */
export function projectedCtlSeries(plan: Plan, fromDate: string, fromCtl: number): CtlPoint[] {
  const loads = expandDailyLoads(plan).filter((d) => d.date > fromDate);
  const ctls = simulateCtl(fromCtl, loads.map((d) => d.load));
  return [{ date: fromDate, ctl: fromCtl }, ...loads.map((d, i) => ({ date: d.date, ctl: ctls[i] }))];
}

export function raceDayCtl(series: CtlPoint[], raceDate: string): number | null {
  const pt = series.filter((p) => p.date <= raceDate).at(-1);
  return pt ? pt.ctl : null;
}

export type RampWarning = { week: number; start: string; ramp: number };

/** Weeks (among those ending after `fromDate`) whose simulated CTL ramp exceeds 6/wk. */
export function rampWarnings(plan: Plan, series: CtlPoint[], fromDate: string): RampWarning[] {
  const byDate = new Map(series.map((p) => [p.date, p.ctl]));
  const warnings: RampWarning[] = [];
  for (const week of plan.weeks) {
    const weekEnd = addDays(week.start, 6);
    if (weekEnd <= fromDate) continue;
    const startCtl = byDate.get(addDays(week.start, -1));
    const endCtl = byDate.get(weekEnd) ?? byDate.get(plan.race.date);
    if (startCtl === undefined || endCtl === undefined) continue;
    const ramp = endCtl - startCtl;
    if (ramp > 6) warnings.push({ week: week.week, start: week.start, ramp });
  }
  return warnings;
}

export type DplusFlag = { week: number; start: string; jumpPct: number };

/** Weeks where planned weekend D+ jumps >20% over the prior week. */
export function weekendDplusFlags(plan: Plan): DplusFlag[] {
  const flags: DplusFlag[] = [];
  for (let i = 1; i < plan.weeks.length; i++) {
    const prev = plan.weeks[i - 1].weekendDplus;
    const cur = plan.weeks[i].weekendDplus;
    if (prev > 0 && cur > prev * 1.2) {
      flags.push({ week: plan.weeks[i].week, start: plan.weeks[i].start, jumpPct: (cur / prev - 1) * 100 });
    }
  }
  return flags;
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
