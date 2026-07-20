export type ReadinessLevel = "green" | "amber" | "red" | "unknown";

export type ReadinessInput = {
  hrv: number | null;
  restingHR: number | null;
  sleepSecs: number | null;
  /** Previous morning's HRV, for the overnight-drop rule. */
  prevHrv?: number | null;
  /** Rolling RHR baseline (e.g. 30-day mean). */
  rhrBaseline?: number | null;
};

export type Readiness = {
  level: ReadinessLevel;
  instruction: string;
  reasons: string[];
};

const INSTRUCTIONS: Record<ReadinessLevel, string> = {
  green: "Train as planned",
  amber: "Cut 25%, no descent",
  red: "Easy 30m flat or rest",
  unknown: "No wellness data yet today",
};

/**
 * Coach's traffic-light protocol:
 *   GREEN = HRV >= 48 AND RHR <= 50 AND sleep > 6h
 *   AMBER = HRV in the low 40s or overnight drop > 10, OR RHR >= baseline+4, OR sleep < 5.5h
 *   RED   = HRV < 40 with elevated RHR (>= baseline+4) and poor sleep (< 6h)
 * Anything that is neither green nor red is treated as amber (conservative).
 */
export function computeReadiness(input: ReadinessInput): Readiness {
  const { hrv, restingHR, sleepSecs } = input;
  if (hrv == null || restingHR == null || sleepSecs == null) {
    return { level: "unknown", instruction: INSTRUCTIONS.unknown, reasons: [] };
  }

  const sleepH = sleepSecs / 3600;
  const baseline = input.rhrBaseline ?? null;
  const rhrElevated = baseline != null && restingHR >= baseline + 4;

  if (hrv < 40 && rhrElevated && sleepH < 6) {
    return {
      level: "red",
      instruction: INSTRUCTIONS.red,
      reasons: [`HRV ${hrv} (<40)`, `RHR ${restingHR} (baseline+4)`, `sleep ${sleepH.toFixed(1)}h`],
    };
  }

  // Amber triggers are deviation warnings, so they override the absolute green
  // thresholds (e.g. RHR 50 is green-legal but still amber if baseline is 45).
  const reasons: string[] = [];
  if (hrv < 45) reasons.push(`HRV ${hrv} — low`);
  if (input.prevHrv != null && input.prevHrv - hrv > 10) reasons.push(`HRV dropped ${input.prevHrv - hrv} overnight`);
  if (rhrElevated) reasons.push(`RHR ${restingHR} ≥ baseline+4`);
  else if (restingHR > 50) reasons.push(`RHR ${restingHR} (>50)`);
  if (sleepH < 5.5) reasons.push(`sleep ${sleepH.toFixed(1)}h (<5.5h)`);

  if (reasons.length === 0 && hrv >= 48 && restingHR <= 50 && sleepH > 6) {
    return { level: "green", instruction: INSTRUCTIONS.green, reasons: [] };
  }
  if (reasons.length === 0) reasons.push("just below green thresholds");

  return { level: "amber", instruction: INSTRUCTIONS.amber, reasons };
}
