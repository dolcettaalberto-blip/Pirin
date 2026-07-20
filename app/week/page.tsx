import { loadCurrentPlan, loadSession } from "@/lib/data";
import { addDays, formatShort, formatWeekday, todayIso, weekdayKey } from "@/lib/dates";
import { getActivities, type Activity } from "@/lib/icu";
import { weekFor } from "@/lib/plan-utils";
import type { Session } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const TYPE_GLYPH: Record<Session["type"], string> = {
  recovery: "〜",
  easy: "—",
  quality: "⋀",
  long: "⛰",
  race: "★",
};

function BarPair({ planned, actual, max }: { planned: number; actual: number | null; max: number }) {
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="w-24 shrink-0 space-y-1">
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-[var(--muted)]" style={{ width: w(planned) }} />
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        {actual != null && <div className="h-full rounded-full bg-accent" style={{ width: w(actual) }} />}
      </div>
    </div>
  );
}

export default async function WeekPage() {
  const today = todayIso();
  const plan = loadCurrentPlan();
  const week = weekFor(plan, today) ?? plan.weeks[0];
  const weekEnd = addDays(week.start, 6);

  const activities = (await getActivities(week.start, weekEnd)) ?? [];
  const loadByDate = new Map<string, number>();
  const kmActual = activities.reduce((sum, a) => sum + (a.distance ?? 0) / 1000, 0);
  const dplusActual = activities.reduce((sum, a) => sum + (a.total_elevation_gain ?? 0), 0);
  for (const a of activities as Activity[]) {
    const date = a.start_date_local.slice(0, 10);
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + (a.icu_training_load ?? 0));
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week.start, i);
    const planned = week.plannedDailyLoad[weekdayKey(date)];
    const session = loadSession(date);
    const actual = loadByDate.has(date) ? Math.round(loadByDate.get(date)!) : null;
    return { date, planned, session, actual, isPast: date < today, isToday: date === today };
  });

  const plannedTotal = days.reduce((sum, d) => sum + d.planned, 0);
  const actualTotal = Math.round(days.reduce((sum, d) => sum + (d.actual ?? 0), 0));
  const maxLoad = Math.max(...days.map((d) => d.planned), ...days.map((d) => d.actual ?? 0), 1);

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">Week {week.week}</h1>
          <p className="text-[13px] text-muted">
            {formatShort(week.start)} – {formatShort(weekEnd)} · {week.block}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 rounded-2xl bg-surface border border-[var(--hairline)] px-4 py-3 text-center">
          <div>
            <p className="text-lg font-semibold tabular">
              {Math.round(kmActual)}<span className="text-muted font-normal">/{week.runKm}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">km</p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular">
              {Math.round(dplusActual)}<span className="text-muted font-normal">/{week.weekendDplus}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">D+ (wknd plan)</p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular">
              {actualTotal}<span className="text-muted font-normal">/{plannedTotal}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">load</p>
          </div>
        </div>
      </header>

      <ul className="space-y-2">
        {days.map((d) => {
          const done = d.actual != null;
          const missed = d.isPast && !done && d.planned > 0;
          return (
            <li
              key={d.date}
              className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                d.isToday ? "border-accent bg-surface" : "border-[var(--hairline)] bg-surface"
              }`}
            >
              <div className="w-11 shrink-0">
                <p className={`text-[12px] font-semibold ${d.isToday ? "text-accent" : "text-ink-2"}`}>
                  {formatWeekday(d.date)}
                </p>
                <p className="text-[11px] text-muted tabular">{formatShort(d.date)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate">
                  {d.session ? (
                    <>
                      <span className="text-muted mr-1.5" aria-hidden>{TYPE_GLYPH[d.session.type]}</span>
                      {d.session.title}
                    </>
                  ) : d.planned === 0 ? (
                    <span className="text-muted">Rest</span>
                  ) : (
                    <span className="text-ink-2">Load {d.planned}</span>
                  )}
                </p>
                <p className="text-[11px] text-muted">
                  {done
                    ? `done · ${d.actual} vs ${d.planned} planned`
                    : missed
                      ? "no activity recorded"
                      : d.planned === 0
                        ? ""
                        : `planned ${d.planned}${d.session?.terrain ? ` · ${d.session.terrain}` : ""}`}
                </p>
              </div>
              <BarPair planned={d.planned} actual={d.actual} max={maxLoad} />
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted text-center">
        grey bar = planned · blue bar = actual (intervals.icu)
      </p>
    </div>
  );
}
