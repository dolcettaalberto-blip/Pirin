import { describe, expect, it } from "vitest";
import { nextCtl, simulateCtl } from "@/lib/ctl";
import { loadOriginalPlan } from "@/lib/data";
import { expandDailyLoads, plannedCtlSeries } from "@/lib/plan-utils";

describe("CTL formula", () => {
  it("applies CTL_t = CTL_{t-1} + (load - CTL_{t-1}) / 42", () => {
    expect(nextCtl(27, 69)).toBeCloseTo(28, 10);
    expect(nextCtl(42, 42)).toBe(42);
    expect(nextCtl(30, 0)).toBeCloseTo(30 - 30 / 42, 10);
  });

  it("matches the hand-computed simulation for the first 14 days of the plan", () => {
    // Daily loads Sep 14 -> Sep 27 read off plan.json by hand (Mon-start weeks,
    // weekday-keyed loads): W1 mon..sun = 0,0,35,0,35,30,0; W2 mon..sun =
    // 0,55,55,45,35,95,30.
    const handLoads = [0, 0, 35, 0, 35, 30, 0, 0, 55, 55, 45, 35, 95, 30];
    // Recurrence from CTL=51 on 2026-09-13, computed independently of lib/:
    const handCtl = [
      49.785714, 48.600340, 48.276523, 47.127082, 46.838341, 46.437429, 45.331776,
      44.252448, 44.508342, 44.758143, 44.763902, 44.531428, 45.733060, 45.358464,
    ];

    const simulated = simulateCtl(51, handLoads);
    simulated.forEach((v, i) => expect(v).toBeCloseTo(handCtl[i], 5));

    // And the full pipeline (plan.json -> expandDailyLoads -> plannedCtlSeries)
    // must produce the same values on the same dates.
    const plan = loadOriginalPlan();
    const expanded = expandDailyLoads(plan).slice(0, 14);
    expect(expanded.map((d) => d.load)).toEqual(handLoads);
    expect(expanded[0].date).toBe("2026-09-14");
    expect(expanded[13].date).toBe("2026-09-27");

    const series = plannedCtlSeries(plan);
    expect(series[0]).toEqual({ date: "2026-09-13", ctl: 51 });
    series.slice(1, 15).forEach((p, i) => expect(p.ctl).toBeCloseTo(handCtl[i], 5));
  });

  it("lands race-day CTL inside the 51-55 target band with the placeholder plan", () => {
    const plan = loadOriginalPlan();
    const series = plannedCtlSeries(plan);
    const race = series.at(-1)!;
    expect(race.date).toBe(plan.race.date);
    expect(race.ctl).toBeGreaterThanOrEqual(51);
    expect(race.ctl).toBeLessThanOrEqual(55);
  });
});
