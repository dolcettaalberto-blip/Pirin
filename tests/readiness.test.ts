import { describe, expect, it } from "vitest";
import { computeReadiness } from "@/lib/readiness";

const H = 3600;

describe("readiness traffic light", () => {
  it("GREEN: HRV >= 48 AND RHR <= 50 AND sleep > 6h", () => {
    const r = computeReadiness({ hrv: 52, restingHR: 47, sleepSecs: 7.5 * H, rhrBaseline: 46 });
    expect(r.level).toBe("green");
    expect(r.instruction).toBe("Train as planned");
  });

  it("AMBER: HRV in the low 40s", () => {
    const r = computeReadiness({ hrv: 43, restingHR: 47, sleepSecs: 7 * H, rhrBaseline: 46 });
    expect(r.level).toBe("amber");
    expect(r.instruction).toBe("Cut 25%, no descent");
  });

  it("AMBER: overnight HRV drop > 10", () => {
    const r = computeReadiness({ hrv: 47, restingHR: 47, sleepSecs: 7 * H, prevHrv: 60, rhrBaseline: 46 });
    expect(r.level).toBe("amber");
    expect(r.reasons.some((x) => x.includes("dropped"))).toBe(true);
  });

  it("AMBER: RHR >= baseline + 4", () => {
    const r = computeReadiness({ hrv: 50, restingHR: 50, sleepSecs: 7 * H, rhrBaseline: 45 });
    expect(r.level).toBe("amber");
  });

  it("AMBER: sleep < 5.5h", () => {
    const r = computeReadiness({ hrv: 55, restingHR: 45, sleepSecs: 5 * H, rhrBaseline: 46 });
    expect(r.level).toBe("amber");
  });

  it("RED: HRV < 40 with elevated RHR and poor sleep", () => {
    const r = computeReadiness({ hrv: 36, restingHR: 52, sleepSecs: 5.5 * H, rhrBaseline: 46 });
    expect(r.level).toBe("red");
    expect(r.instruction).toBe("Easy 30m flat or rest");
  });

  it("HRV < 40 alone (good sleep, normal RHR) is amber, not red", () => {
    const r = computeReadiness({ hrv: 38, restingHR: 46, sleepSecs: 8 * H, rhrBaseline: 46 });
    expect(r.level).toBe("amber");
  });

  it("unknown when today's data is missing", () => {
    const r = computeReadiness({ hrv: null, restingHR: null, sleepSecs: null });
    expect(r.level).toBe("unknown");
  });
});
