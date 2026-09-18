import type { Briefing } from "@/lib/schemas";

/** Content-only — the caller (Today page) supplies the card's <section> wrapper, since it's shared with the Generate/Regenerate button. */
export function MorningBriefingCard({ briefing }: { briefing: Briefing }) {
  return (
    <div>
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
    </div>
  );
}
