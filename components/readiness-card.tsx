import type { Readiness } from "@/lib/readiness";

const LEVEL_STYLES: Record<Readiness["level"], { bg: string; label: string }> = {
  green: { bg: "bg-good", label: "GREEN" },
  amber: { bg: "bg-warn", label: "AMBER" },
  red: { bg: "bg-critical", label: "RED" },
  unknown: { bg: "bg-surface-2", label: "—" },
};

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-semibold tabular">
        {value}
        {unit && <span className="text-sm font-normal text-ink-2 ml-0.5">{unit}</span>}
      </span>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

export function ReadinessCard({
  readiness,
  hrv,
  restingHR,
  sleepSecs,
}: {
  readiness: Readiness;
  hrv: number | null;
  restingHR: number | null;
  sleepSecs: number | null;
}) {
  const style = LEVEL_STYLES[readiness.level];
  const sleep =
    sleepSecs != null
      ? `${Math.floor(sleepSecs / 3600)}h${Math.round((sleepSecs % 3600) / 60)
          .toString()
          .padStart(2, "0")}`
      : "–";
  const dark = readiness.level === "amber"; // amber needs dark text for contrast
  return (
    <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4">
      <div className="flex items-center gap-3">
        <span
          className={`${style.bg} ${dark ? "text-black" : "text-white"} ${
            readiness.level === "unknown" ? "text-muted" : ""
          } rounded-xl px-4 py-2.5 text-xl font-bold tracking-wide`}
        >
          {style.label}
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{readiness.instruction}</p>
          {readiness.reasons.length > 0 && (
            <p className="text-[12px] text-ink-2 leading-snug mt-0.5">{readiness.reasons.join(" · ")}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[var(--hairline)]">
        <Metric label="HRV" value={hrv != null ? String(hrv) : "–"} />
        <Metric label="RHR" value={restingHR != null ? String(restingHR) : "–"} />
        <Metric label="Sleep" value={sleep} />
      </div>
    </section>
  );
}
