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
    // Daily loads Nov 23 -> Dec 6 read off plan.json by hand (Mon-start weeks,
    // weekday-keyed loads): W1 mon..sun = 0,40,0,45,0,100,40; W2 mon..sun =
    // 0,45,40,0,45,115,45.
    const handLoads = [0, 40, 0, 45, 0, 100, 40, 0, 45, 40, 0, 45, 115, 45];
    // Recurrence from CTL=50 on 2026-11-22, computed independently of lib/:
    const handCtl = [
      48.809524, 48.599773, 47.442636, 47.384478, 46.256276, 47.535888, 47.356463,
      46.228928, 46.199667, 46.052056, 44.955579, 44.956636, 46.624336, 46.585661,
    ];

    const simulated = simulateCtl(50, handLoads);
    simulated.forEach((v, i) => expect(v).toBeCloseTo(handCtl[i], 5));

    // And the full pipeline (plan.json -> expandDailyLoads -> plannedCtlSeries)
    // must produce the same values on the same dates.
    const plan = loadOriginalPlan();
    const expanded = expandDailyLoads(plan).slice(0, 14);
    expect(expanded.map((d) => d.load)).toEqual(handLoads);
    expect(expanded[0].date).toBe("2026-11-23");
    expect(expanded[13].date).toBe("2026-12-06");

    const series = plannedCtlSeries(plan);
    expect(series[0]).toEqual({ date: "2026-11-22", ctl: 50 });
    series.slice(1, 15).forEach((p, i) => expect(p.ctl).toBeCloseTo(handCtl[i], 5));
  });

  it("lands start-line CTL inside the 56-61 target band with the placeholder plan", () => {
    const plan = loadOriginalPlan();
    const series = plannedCtlSeries(plan);
    const race = series.at(-1)!;
    expect(race.date).toBe(plan.race.date);
    expect(race.ctl).toBeGreaterThanOrEqual(56);
    expect(race.ctl).toBeLessThanOrEqual(61);
  });
});
