import type { Activity } from "@/lib/icu";
import { formatDuration } from "@/lib/workout";

function fmtPace(secsPerKm: number): string {
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/** One recorded intervals.icu activity, as a compact stat line. */
export function ActivityLine({ activity }: { activity: Activity }) {
  const km = activity.distance != null ? activity.distance / 1000 : null;
  const parts: string[] = [];
  if (km != null && km > 0) parts.push(`${km.toFixed(1)} km`);
  if (activity.total_elevation_gain) parts.push(`${Math.round(activity.total_elevation_gain)} m D+`);
  if (activity.moving_time) parts.push(formatDuration(activity.moving_time));
  if (km != null && km > 0.5 && activity.moving_time && activity.type === "Run")
    parts.push(fmtPace(activity.moving_time / km));
  if (activity.average_heartrate) parts.push(`${Math.round(activity.average_heartrate)} bpm`);
  if (activity.icu_rpe != null) parts.push(`RPE ${activity.icu_rpe}`);
  return (
    <p className="text-[12px] text-ink-2 leading-snug">
      <span className="text-ink font-medium">{activity.name ?? activity.type ?? "Activity"}</span>
      {activity.icu_training_load != null && (
        <span className="text-muted"> · load {Math.round(activity.icu_training_load)}</span>
      )}
      <br />
      <span className="text-muted tabular">{parts.join(" · ")}</span>
    </p>
  );
}
