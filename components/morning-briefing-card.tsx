import type { Briefing } from "@/lib/schemas";

export function MorningBriefingCard({ briefing }: { briefing: Briefing }) {
  return (
    <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4">
      <h2 className="text-[11px] uppercase tracking-wide text-muted font-semibold">Coach's note</h2>
      <p className="font-semibold leading-tight mt-1">{briefing.headline}</p>
      <p className="text-[13px] text-ink-2 leading-snug mt-1">{briefing.summary}</p>
      {briefing.flags.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {briefing.flags.map((flag, i) => (
            <li key={i} className="text-[12px] text-ink-2 leading-snug">
              ⚑ {flag}
            </li>
          ))}
        </ul>
      )}
      {briefing.suggestedChange && (
        <p className="text-[12px] text-warn mt-2 pt-2 border-t border-[var(--hairline)]">
          Suggested: {briefing.suggestedChange} — confirm before this changes the plan.
        </p>
      )}
    </section>
  );
}
