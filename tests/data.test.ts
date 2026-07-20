import { describe, expect, it } from "vitest";
import { loadChangelog, loadCurrentPlan, loadOriginalPlan, loadSession, listSessionDates } from "@/lib/data";
import { addDays, parseIso, weekdayKey } from "@/lib/dates";
import { plannedLoadFor } from "@/lib/plan-utils";

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

  it("race day is a rest-load day (the race itself is not training load)", () => {
    const plan = loadOriginalPlan();
    expect(weekdayKey(plan.race.date)).toBe("sun");
    expect(plannedLoadFor(plan, plan.race.date)).toBe(0);
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
    const first = plan.weeks[0].start;
    for (const entry of changelog) {
      for (const date of entry.affects) {
        expect(date >= first && date <= plan.race.date, `${date} outside plan window`).toBe(true);
      }
    }
  });
});
