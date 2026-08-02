import { describe, expect, it } from "vitest";
import { loadChangelog, loadCurrentPlan, loadOriginalPlan, loadSession, listSessionDates } from "@/lib/data";
import { addDays, parseIso, weekdayKey } from "@/lib/dates";
import {
  expandDailyLoads,
  plannedCtlSeries,
  plannedLoadFor,
  raceDayCtl,
  weekendDplusFlags,
} from "@/lib/plan-utils";

// Build-time data validation: `npm run build` runs this suite, so malformed
// data in /data fails the deploy loudly.
describe("data files", () => {
  it("plan.json and current-plan.json parse against the schema", () => {
    expect(() => loadOriginalPlan()).not.toThrow();
    expect(() => loadCurrentPlan()).not.toThrow();
  });

  it("plans share race, baseline and target; weeks are sequential Mondays", () => {
    const original = loadOriginalPlan();
    const current = loadCurrentPlan();
    // `race` must match across both files so the two chart lines share an
    // x-axis and a race marker. It describes the real event, so correcting it
    // (e.g. the verified 12 Sep start) means editing BOTH files together —
    // that is the one legitimate reason to touch frozen plan.json.
    expect(current.race).toEqual(original.race);
    expect(current.baseline).toEqual(original.baseline);
    expect(current.targetRaceCtl).toBe(original.targetRaceCtl);

    for (const plan of [original, current]) {
      plan.weeks.forEach((w, i) => {
        expect(w.week).toBe(i + 1);
        expect(parseIso(w.start).getUTCDay()).toBe(1); // Monday
        if (i > 0) expect(w.start).toBe(addDays(plan.weeks[i - 1].start, 7));
      });
      const lastWeekEnd = addDays(plan.weeks.at(-1)!.start, 6);
      expect(plan.race.date <= lastWeekEnd).toBe(true);
    }
  });

  it("race day is excluded from the CTL simulation whatever load it carries", () => {
    // The race is the outcome, not an input: its load (~360) must never reach
    // the CTL recurrence, or the trajectory ends on a meaningless spike.
    const current = loadCurrentPlan();
    const raceDate = current.race.date;
    expect(expandDailyLoads(current).some((d) => d.date >= raceDate)).toBe(false);

    // The series still reaches race day, holding the start-line CTL.
    const series = plannedCtlSeries(current);
    const lastTwo = series.slice(-2);
    expect(lastTwo[1].date).toBe(raceDate);
    expect(lastTwo[1].ctl).toBeCloseTo(lastTwo[0].ctl, 10);

    // And that value is unaffected by how big the race-day load is.
    const inflated = {
      ...current,
      weeks: current.weeks.map((w) =>
        w.start <= raceDate && raceDate <= addDays(w.start, 6)
          ? { ...w, plannedDailyLoad: { ...w.plannedDailyLoad, [weekdayKey(raceDate)]: 9999 } }
          : w
      ),
    };
    expect(raceDayCtl(plannedCtlSeries(inflated), raceDate)).toBeCloseTo(
      raceDayCtl(series, raceDate)!,
      10
    );
  });

  it("the race week is not flagged as a training ramp", () => {
    const current = loadCurrentPlan();
    const raceWeek = current.weeks.find(
      (w) => w.start <= current.race.date && current.race.date <= addDays(w.start, 6)
    )!;
    expect(weekendDplusFlags(current).some((f) => f.week === raceWeek.week)).toBe(false);
  });

  it("every session file parses, matches its filename, and matches the current plan's load", () => {
    const current = loadCurrentPlan();
    const dates = listSessionDates();
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      const session = loadSession(date)!;
      expect(session, date).not.toBeNull();
      expect(session.date, `filename/date mismatch in ${date}.json`).toBe(date);
      const planned = plannedLoadFor(current, date);
      if (planned != null) {
        expect(session.estimatedLoad, `estimatedLoad vs plannedDailyLoad for ${date}`).toBe(planned);
      }
    }
  });

  it("changelog parses and its affected dates are inside the plan window", () => {
    const changelog = loadChangelog();
    const plan = loadCurrentPlan();
    // Window runs to the end of the final week, not to race day: post-race
    // recovery/travel days are legitimate targets for a coach decision.
    const first = plan.weeks[0].start;
    const last = addDays(plan.weeks.at(-1)!.start, 6);
    for (const entry of changelog) {
      for (const date of entry.affects) {
        expect(date >= first && date <= last, `${date} outside plan window`).toBe(true);
      }
    }
  });
});
