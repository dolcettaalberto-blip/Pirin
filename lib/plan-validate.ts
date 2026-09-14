import { addDays, parseIso, weekdayKey } from "./dates";
import { plannedLoadFor } from "./plan-utils";
import {
  ChangelogSchema,
  PlanSchema,
  SessionSchema,
  type Changelog,
  type Plan,
  type PlanWeek,
  type Session,
} from "./schemas";

/** The repo's plan data as one in-memory value, so updates can be validated before they are committed. */
export type RepoState = {
  frozenPlan: Plan;
  currentPlan: Plan;
  /** keyed by ISO date */
  sessions: Record<string, Session>;
  changelog: Changelog;
};

export type PlanUpdate = {
  /** Patches to `current-plan.json` weeks, keyed by week number. */
  weeks?: Array<{ week: number } & Partial<Omit<PlanWeek, "week">>>;
  /** Whole session documents, keyed by ISO date. Replaces any existing file. */
  sessions?: Record<string, unknown>;
  /** Session dates to delete (rest days). */
  removeSessions?: string[];
  /** Required: every change is logged. */
  changelog: { date: string; change: string; reason: string; affects: string[] };
};

/** Apply an update to a state value, returning a new state. Pure — no I/O. */
export function applyUpdate(state: RepoState, update: PlanUpdate): RepoState {
  const weekPatches = new Map((update.weeks ?? []).map((w) => [w.week, w]));
  const currentPlan: Plan = {
    ...state.currentPlan,
    weeks: state.currentPlan.weeks.map((w) => {
      const patch = weekPatches.get(w.week);
      if (!patch) return w;
      return {
        ...w,
        ...patch,
        plannedDailyLoad: { ...w.plannedDailyLoad, ...(patch.plannedDailyLoad ?? {}) },
      };
    }),
  };

  const sessions = { ...state.sessions };
  for (const [date, doc] of Object.entries(update.sessions ?? {})) {
    sessions[date] = doc as Session;
  }
  for (const date of update.removeSessions ?? []) delete sessions[date];

  return {
    ...state,
    currentPlan,
    sessions,
    changelog: [...state.changelog, update.changelog],
  };
}

/**
 * Every invariant the build-time test suite enforces, checked in memory. An
 * agent-driven write is rejected here rather than being committed and taking
 * the Railway deploy down.
 */
export function validateState(state: RepoState): string[] {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);

  const parsed = PlanSchema.safeParse(state.currentPlan);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) push(`current-plan.json ${issue.path.join(".")}: ${issue.message}`);
    return errors; // everything below assumes a well-formed plan
  }
  const plan = parsed.data;
  const frozen = state.frozenPlan;

  if (JSON.stringify(plan.race) !== JSON.stringify(frozen.race))
    push("current-plan.json `race` must match plan.json (correct both together if the event details changed)");
  if (JSON.stringify(plan.baseline) !== JSON.stringify(frozen.baseline))
    push("current-plan.json `baseline` must match plan.json");
  if (plan.targetRaceCtl !== frozen.targetRaceCtl)
    push("current-plan.json `targetRaceCtl` must match plan.json");

  plan.weeks.forEach((w, i) => {
    if (w.week !== i + 1) push(`week ${w.week}: weeks must be numbered 1..n in order`);
    if (parseIso(w.start).getUTCDay() !== 1) push(`week ${w.week}: start ${w.start} is not a Monday`);
    if (i > 0 && w.start !== addDays(plan.weeks[i - 1].start, 7))
      push(`week ${w.week}: start ${w.start} is not 7 days after week ${i}`);
  });

  const firstStart = plan.weeks[0].start;
  const lastEnd = addDays(plan.weeks.at(-1)!.start, 6);
  if (plan.race.date > lastEnd) push(`race date ${plan.race.date} falls outside the final plan week`);

  for (const [date, doc] of Object.entries(state.sessions)) {
    const result = SessionSchema.safeParse(doc);
    if (!result.success) {
      for (const issue of result.error.issues) push(`sessions/${date}.json ${issue.path.join(".")}: ${issue.message}`);
      continue;
    }
    const session = result.data;
    if (session.date !== date) push(`sessions/${date}.json: date field is ${session.date}, must match the filename`);
    const planned = plannedLoadFor(plan, date);
    if (planned != null && session.estimatedLoad !== planned)
      push(
        `sessions/${date}.json: estimatedLoad ${session.estimatedLoad} !== plannedDailyLoad.${weekdayKey(date)} ` +
          `(${planned}) for week ${plan.weeks.find((w) => date >= w.start && date <= addDays(w.start, 6))?.week}. ` +
          `Change both together.`
      );
  }

  const changelog = ChangelogSchema.safeParse(state.changelog);
  if (!changelog.success) {
    for (const issue of changelog.error.issues) push(`changelog.json ${issue.path.join(".")}: ${issue.message}`);
  } else {
    for (const entry of changelog.data) {
      for (const d of entry.affects) {
        // Rolling blocks: entries predating the current block's baseline belong
        // to an archived block and are history, not a plan error. Only dates
        // inside the current block are held to the window.
        if (d <= plan.baseline.date) continue;
        if (d < firstStart || d > lastEnd) push(`changelog entry ${entry.date}: affected date ${d} is outside the plan window`);
      }
    }
  }

  return errors;
}
