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
    // Daily loads Jul 15 -> Jul 28 read off plan.json by hand (Tue-start weeks,
    // weekday-keyed loads): W1 wed..mon = 0,55,20,90,60,25; W2 tue..mon =
    // 40,0,60,20,95,65,25; W3 tue = 45.
    const handLoads = [0, 55, 20, 90, 60, 25, 40, 0, 60, 20, 95, 65, 25, 45];
    // Recurrence from CTL=27 on 2026-07-14, computed independently of lib/:
    const handCtl = [
      26.357143, 27.039116, 26.871518, 28.374577, 29.127563, 29.029288, 29.290495,
      28.593102, 29.340886, 29.118484, 30.687091, 31.504065, 31.349207, 31.674225,
    ];

    const simulated = simulateCtl(27, handLoads);
    simulated.forEach((v, i) => expect(v).toBeCloseTo(handCtl[i], 5));

    // And the full pipeline (plan.json -> expandDailyLoads -> plannedCtlSeries)
    // must produce the same values on the same dates.
    const plan = loadOriginalPlan();
    const expanded = expandDailyLoads(plan).slice(0, 14);
    expect(expanded.map((d) => d.load)).toEqual(handLoads);
    expect(expanded[0].date).toBe("2026-07-15");
    expect(expanded[13].date).toBe("2026-07-28");

    const series = plannedCtlSeries(plan);
    expect(series[0]).toEqual({ date: "2026-07-14", ctl: 27 });
    series.slice(1, 15).forEach((p, i) => expect(p.ctl).toBeCloseTo(handCtl[i], 5));
  });

  it("lands race-day CTL inside the 40-44 target band with the placeholder plan", () => {
    const plan = loadOriginalPlan();
    const series = plannedCtlSeries(plan);
    const race = series.at(-1)!;
    expect(race.date).toBe(plan.race.date);
    expect(race.ctl).toBeGreaterThanOrEqual(40);
    expect(race.ctl).toBeLessThanOrEqual(44);
  });
});
