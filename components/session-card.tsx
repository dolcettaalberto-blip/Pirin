import type { Session, SessionStep } from "@/lib/schemas";
import { formatDuration, totalSeconds } from "@/lib/workout";
import { WorkoutTimeline } from "./workout-timeline";
import { SendToWatch } from "./send-to-watch";

const TYPE_LABEL: Record<Session["type"], string> = {
  recovery: "Recovery",
  easy: "Easy",
  quality: "Quality",
  long: "Long",
  race: "Race",
};

function StepLine({ step, depth = 0 }: { step: SessionStep; depth?: number }) {
  if (step.kind === "repeat") {
    return (
      <li>
        <p className="text-ink font-medium">{step.count}×</p>
        <ul className="ml-4 space-y-1 mt-1">
          {step.steps.map((s, i) => (
            <StepLine key={i} step={s} depth={depth + 1} />
          ))}
        </ul>
        {step.note && <p className="text-muted text-[12px] ml-4">{step.note}</p>}
      </li>
    );
  }
  return (
    <li className="flex gap-2 items-baseline">
      <span className="text-ink-2 tabular w-12 shrink-0">{step.duration}</span>
      <span className="text-ink">
        {step.target ?? step.kind}
        {step.note && <span className="text-muted"> — {step.note}</span>}
      </span>
    </li>
  );
}

export function SessionCard({ session }: { session: Session }) {
  const total = totalSeconds(session.steps);
  return (
    <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">
            {TYPE_LABEL[session.type]}
            {total > 0 && <> · {formatDuration(total)}</>}
          </p>
          <h2 className="text-lg font-semibold leading-tight mt-0.5">{session.title}</h2>
          {session.terrain && <p className="text-[12px] text-ink-2 mt-0.5">{session.terrain}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-semibold tabular">{session.estimatedLoad}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted">load</p>
        </div>
      </div>

      <WorkoutTimeline steps={session.steps} />

      <ul className="space-y-1 text-[14px]">
        {session.steps.map((s, i) => (
          <StepLine key={i} step={s} />
        ))}
      </ul>

      {session.coachNotes && (
        <p className="text-[13px] text-ink-2 border-l-2 border-accent pl-3 leading-snug">{session.coachNotes}</p>
      )}

      <SendToWatch date={session.date} />
    </section>
  );
}
