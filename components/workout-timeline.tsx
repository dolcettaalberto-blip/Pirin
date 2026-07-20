import type { SessionStep } from "@/lib/schemas";
import { flattenSteps, type Zone } from "@/lib/workout";

const ZONE_COLORS: Record<Zone, string> = {
  z1: "var(--z1)",
  z2: "var(--z2)",
  z3: "var(--z3)",
  z4: "var(--z4)",
  z5: "var(--z5)",
  rest: "var(--rest)",
};

/** Horizontal timeline of the workout, segment width ∝ duration, colored by intensity zone. */
export function WorkoutTimeline({ steps }: { steps: SessionStep[] }) {
  const segments = flattenSteps(steps).filter((s) => s.seconds > 0);
  const total = segments.reduce((sum, s) => sum + s.seconds, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-8 w-full gap-[2px]" role="img" aria-label="Workout intensity timeline">
      {segments.map((seg, i) => (
        <div
          key={i}
          className="rounded-[3px] min-w-[3px]"
          style={{
            width: `${(seg.seconds / total) * 100}%`,
            background: ZONE_COLORS[seg.zone],
            height: seg.zone === "rest" ? "50%" : "100%",
            alignSelf: "flex-end",
          }}
          title={`${seg.kind} ${seg.target ?? ""}`.trim()}
        />
      ))}
    </div>
  );
}
