import { describe, expect, it } from "vitest";
import { loadChangelog, loadCurrentPlan, loadOriginalPlan, loadSession, listSessionDates } from "@/lib/data";
import { applyUpdate, validateState, type PlanUpdate, type RepoState } from "@/lib/plan-validate";
import type { Session } from "@/lib/schemas";

function state(): RepoState {
  const sessions: Record<string, Session> = {};
  for (const d of listSessionDates()) sessions[d] = loadSession(d)!;
  return {
    frozenPlan: loadOriginalPlan(),
    currentPlan: loadCurrentPlan(),
    sessions,
    changelog: loadChangelog(),
  };
}

const entry = { date: "2026-08-05", change: "test", reason: "test", affects: ["2026-08-05"] };

describe("agent plan updates", () => {
  it("the repo as committed is valid", () => {
    expect(validateState(state())).toEqual([]);
  });

  it("accepts a week patch plus a matching session", () => {
    const s = state();
    const week = s.currentPlan.weeks.find((w) => w.week === 5)!;
    const update: PlanUpdate = {
      weeks: [{ week: 5, plannedDailyLoad: { ...week.plannedDailyLoad, wed: 44 } }],
      sessions: {
        "2026-08-12": {
          date: "2026-08-12", type: "easy", title: "Test session", estimatedLoad: 44,
          steps: [{ kind: "work", duration: "45m", target: "Z2" }],
          icuWorkoutText: "- 45m Z2",
        },
      },
      changelog: { ...entry, affects: ["2026-08-12"] },
    };
    expect(validateState(applyUpdate(s, update))).toEqual([]);
  });

  it("rejects a session whose load disagrees with the week (the thing that breaks the build)", () => {
    const update: PlanUpdate = {
      sessions: {
        "2026-08-12": {
          date: "2026-08-12", type: "easy", title: "Mismatched", estimatedLoad: 999,
          steps: [{ kind: "work", duration: "45m", target: "Z2" }],
          icuWorkoutText: "- 45m Z2",
        },
      },
      changelog: entry,
    };
    const errors = validateState(applyUpdate(state(), update));
    expect(errors.some((e) => e.includes("estimatedLoad 999"))).toBe(true);
  });

  it("rejects a session whose date does not match its key", () => {
    const update: PlanUpdate = {
      sessions: {
        "2026-08-12": {
          date: "2026-08-13", type: "easy", title: "Wrong date", estimatedLoad: 0,
          steps: [{ kind: "work", duration: "45m", target: "Z2" }],
          icuWorkoutText: "- 45m Z2",
        },
      },
      changelog: entry,
    };
    expect(validateState(applyUpdate(state(), update)).some((e) => e.includes("must match the filename"))).toBe(true);
  });

  it("rejects malformed session documents", () => {
    const update: PlanUpdate = {
      sessions: { "2026-08-12": { date: "2026-08-12", title: "no steps" } },
      changelog: entry,
    };
    expect(validateState(applyUpdate(state(), update)).length).toBeGreaterThan(0);
  });

  it("rejects tampering with the frozen race/baseline fields", () => {
    const s = state();
    s.currentPlan = { ...s.currentPlan, targetRaceCtl: 99 };
    expect(validateState(s).some((e) => e.includes("targetRaceCtl"))).toBe(true);
  });

  it("rejects a changelog entry pointing outside the plan window", () => {
    const update: PlanUpdate = { changelog: { ...entry, affects: ["2027-01-01"] } };
    expect(validateState(applyUpdate(state(), update)).some((e) => e.includes("outside the plan window"))).toBe(true);
  });

  it("removing a session leaves the state valid, and the changelog only grows", () => {
    const s = state();
    const date = listSessionDates()[0];
    const after = applyUpdate(s, { removeSessions: [date], changelog: entry });
    expect(after.sessions[date]).toBeUndefined();
    expect(after.changelog.length).toBe(s.changelog.length + 1);
    expect(after.changelog.slice(0, -1)).toEqual(s.changelog);
  });
});
