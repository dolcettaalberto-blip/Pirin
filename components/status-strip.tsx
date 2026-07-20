function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-semibold tabular">{value != null ? Math.round(value) : "–"}</span>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

/** Current CTL / ATL / TSB with a 7-day CTL sparkline. */
export function StatusStrip({
  ctl,
  atl,
  spark,
}: {
  ctl: number | null;
  atl: number | null;
  spark: number[];
}) {
  const tsb = ctl != null && atl != null ? ctl - atl : null;
  return (
    <section className="rounded-2xl bg-surface border border-[var(--hairline)] px-4 py-3 flex items-center justify-between gap-3">
      <div className="grid grid-cols-3 gap-5">
        <Stat label="CTL" value={ctl} />
        <Stat label="ATL" value={atl} />
        <Stat label="TSB" value={tsb} />
      </div>
      <Sparkline values={spark} />
    </section>
  );
}
