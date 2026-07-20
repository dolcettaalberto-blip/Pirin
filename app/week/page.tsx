import Link from "next/link";
import { ActivityLine } from "@/components/activity-line";
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

function WeekArrow({ week, dir }: { week?: { week: number }; dir: "prev" | "next" }) {
  const glyph = dir === "prev" ? "‹" : "›";
  if (!week) return <span className="w-10 text-center text-2xl text-grid select-none">{glyph}</span>;
  return (
    <Link
      href={`/week?w=${week.week}`}
      aria-label={`${dir === "prev" ? "Previous" : "Next"} week`}
      className="w-10 py-1 text-center text-2xl text-ink-2 active:text-accent"
    >
      {glyph}
    </Link>
  );
}

/** Day rows with a session file link through to the full session detail page. */
function MaybeSessionLink({
  date,
  hasSession,
  children,
}: {
  date: string;
  hasSession: boolean;
  children: React.ReactNode;
}) {
  const cls = "block px-3 py-2.5";
  if (!hasSession) return <div className={cls}>{children}</div>;
  return (
    <Link href={`/session/${date}`} className={`${cls} active:opacity-70`}>
      {children}
    </Link>
  );
}

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

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const today = todayIso();
  const plan = loadCurrentPlan();
  const currentWeek = weekFor(plan, today) ?? plan.weeks[0];
  const { w } = await searchParams;
  const week = plan.weeks.find((x) => x.week === Number(w)) ?? currentWeek;
  const weekEnd = addDays(week.start, 6);

  const activities = (await getActivities(week.start, weekEnd)) ?? [];
  const actsByDate = new Map<string, Activity[]>();
  const kmActual = activities.reduce((sum, a) => sum + (a.distance ?? 0) / 1000, 0);
  const dplusActual = activities.reduce((sum, a) => sum + (a.total_elevation_gain ?? 0), 0);
  for (const a of activities) {
    const date = a.start_date_local.slice(0, 10);
    actsByDate.set(date, [...(actsByDate.get(date) ?? []), a]);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week.start, i);
    const planned = week.plannedDailyLoad[weekdayKey(date)];
    const session = loadSession(date);
    const acts = actsByDate.get(date) ?? [];
    const actual = acts.length
      ? Math.round(acts.reduce((sum, a) => sum + (a.icu_training_load ?? 0), 0))
      : null;
    return { date, planned, session, acts, actual, isPast: date < today, isToday: date === today };
  });

  const plannedTotal = days.reduce((sum, d) => sum + d.planned, 0);
  const actualTotal = Math.round(days.reduce((sum, d) => sum + (d.actual ?? 0), 0));
  const maxLoad = Math.max(...days.map((d) => d.planned), ...days.map((d) => d.actual ?? 0), 1);

  return (
    <div className="space-y-4 md:max-w-2xl md:mx-auto">
      <header>
        <div className="flex items-center justify-between gap-2">
          <WeekArrow week={plan.weeks.find((x) => x.week === week.week - 1)} dir="prev" />
          <div className="text-center">
            <h1 className="text-xl font-bold leading-tight">
              Week {week.week}
              {week.week !== currentWeek.week && (
                <Link href="/week" className="ml-2 align-middle text-[11px] font-medium text-accent">
                  back to now
                </Link>
              )}
            </h1>
            <p className="text-[13px] text-muted">
              {formatShort(week.start)} – {formatShort(weekEnd)} · {week.block}
            </p>
          </div>
          <WeekArrow week={plan.weeks.find((x) => x.week === week.week + 1)} dir="next" />
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
              className={`rounded-xl border ${
                d.isToday ? "border-accent bg-surface" : "border-[var(--hairline)] bg-surface"
              }`}
            >
              <MaybeSessionLink date={d.date} hasSession={d.session != null}>
                <div className="flex items-center gap-3">
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
                  {d.session && <span className="text-muted text-lg -ml-1" aria-hidden>›</span>}
                </div>
                {d.acts.length > 0 && (
                  <div className="mt-2 ml-14 space-y-1.5 border-t border-[var(--hairline)] pt-2">
                    {d.acts.map((a) => (
                      <ActivityLine key={a.id} activity={a} />
                    ))}
                  </div>
                )}
              </MaybeSessionLink>
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
