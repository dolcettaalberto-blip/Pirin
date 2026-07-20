import type { SessionStep } from "./schemas";

export type Zone = "z1" | "z2" | "z3" | "z4" | "z5" | "rest";

export type FlatSegment = {
  kind: "warmup" | "work" | "recover" | "cooldown";
  seconds: number;
  zone: Zone;
  target?: string;
};

export function parseDurationSecs(duration: string): number {
  const m = duration.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) | 0;
}

/** Extract the intensity zone from a free-text target ("Z4, 8-10% incline", "Z1-Z2", "walk"). Ranges use the upper zone. */
export function zoneOf(target: string | undefined, kind: FlatSegment["kind"]): Zone {
  if (target) {
    const zones = [...target.matchAll(/Z([1-5])/gi)].map((m) => Number(m[1]));
    if (zones.length > 0) return `z${Math.max(...zones)}` as Zone;
    if (/strides|fast|sprint/i.test(target)) return "z5";
    if (/walk|rest/i.test(target)) return "rest";
  }
  if (kind === "recover") return "rest";
  if (kind === "warmup" || kind === "cooldown") return "z1";
  return "z2";
}

/** Expand a session's step tree (repeats included) into a flat list of timed segments. */
export function flattenSteps(steps: SessionStep[]): FlatSegment[] {
  const out: FlatSegment[] = [];
  for (const step of steps) {
    if (step.kind === "repeat") {
      const inner = flattenSteps(step.steps);
      for (let i = 0; i < step.count; i++) out.push(...inner);
    } else {
      out.push({
        kind: step.kind,
        seconds: parseDurationSecs(step.duration),
        zone: zoneOf(step.target, step.kind),
        target: step.target,
      });
    }
  }
  return out;
}

export function totalSeconds(steps: SessionStep[]): number {
  return flattenSteps(steps).reduce((sum, s) => sum + s.seconds, 0);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}m`;
}
