import { describe, expect, it } from "vitest";
import { bpmToLthrText } from "../lib/workout";

describe("bpmToLthrText", () => {
  it("rewrites bpm ranges and singles as %LTHR, leaving structure intact", () => {
    expect(bpmToLthrText("- 15m 128-148bpm\n\n3x\n- 12m 166-172bpm\n- 2m 140bpm", 175)).toBe(
      "- 15m 73.1-84.6% LTHR\n\n3x\n- 12m 94.9-98.3% LTHR\n- 2m 80% LTHR",
    );
  });
  it("round-trips to within 0.1 bpm", () => {
    const out = bpmToLthrText("- 1m 176-184bpm", 175);
    const [lo, hi] = out.match(/([\d.]+)-([\d.]+)%/)!.slice(1).map(Number);
    expect(Math.abs((lo * 175) / 100 - 176)).toBeLessThan(0.1);
    expect(Math.abs((hi * 175) / 100 - 184)).toBeLessThan(0.1);
  });
});
