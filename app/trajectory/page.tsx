import { ChartSection, type CtlChartPoint, type DplusChartPoint } from "@/components/chart-section";
import { loadChangelog, loadCurrentPlan, loadOriginalPlan } from "@/lib/data";
import { addDays, formatShort, todayIso, weekdayKey } from "@/lib/dates";
import { getActivities, getWellness } from "@/lib/icu";
import {
  plannedCtlSeries,
  projectedCtlSeries,
  raceDayCtl,
  rampWarnings,
  weekendDplusFlags,
} from "@/lib/plan-utils";

export const dynamic = "force-dynamic";

export default async function TrajectoryPage() {
  const today = todayIso();
  const original = loadOriginalPlan();
  const current = loadCurrentPlan();
  const changelog = loadChangelog();
  const raceDate = original.race.date;
  const baseline = original.baseline.date;

  const [wellness, activities] = await Promise.all([
    getWellness(baseline, today),
    getActivities(baseline, today),
  ]);

  const actual = (wellness ?? [])
    .filter((w) => w.ctl != null && w.id >= baseline && w.id <= today)
    .map((w) => ({ date: w.id, ctl: w.ctl as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const planSeries = plannedCtlSeries(original);
  const lastActual = actual.at(-1) ?? { date: baseline, ctl: current.baseline.ctl };
  const projSeries = projectedCtlSeries(current, lastActual.date, lastActual.ctl);

  const byDate = new Map<string, CtlChartPoint>();
  for (const p of planSeries) byDate.set(p.date, { date: p.date, plan: round1(p.ctl) });
  for (const p of actual) {
    byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), actual: round1(p.ctl) });
  }
  for (const p of projSeries) {
    byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), projected: round1(p.ctl) });
  }
  const ctlData = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const projectedRaceCtl = raceDayCtl(projSeries, raceDate);
  const delta = projectedRaceCtl != null ? projectedRaceCtl - original.targetRaceCtl : null;
  const warnings = rampWarnings(current, projSeries, today);

  // Weekend (Sat+Sun) D+ per week: planned from the plan, actual from activities.
  const dplusActualByWeek = new Map<number, number>();
  for (const a of activities ?? []) {
    const date = a.start_date_local.slice(0, 10);
    const day = weekdayKey(date);
    if (day !== "sat" && day !== "sun") continue;
    const week = current.weeks.find((w) => date >= w.start && date <= addDays(w.start, 6));
    if (!week) continue;
    dplusActualByWeek.set(week.week, (dplusActualByWeek.get(week.week) ?? 0) + (a.total_elevation_gain ?? 0));
  }
  const dplusData: DplusChartPoint[] = current.weeks.map((w) => ({
    week: `W${w.week}`,
    planned: w.weekendDplus,
    actual: dplusActualByWeek.has(w.week) ? Math.round(dplusActualByWeek.get(w.week)!) : null,
  }));
  const dplusFlags = weekendDplusFlags(current);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Trajectory</h1>
        <p className="text-[13px] text-muted">
          {original.race.name} · {formatShort(raceDate)}
        </p>
      </header>

      <ChartSection ctlData={ctlData} dplusData={dplusData} raceDate={raceDate} />

      {projectedRaceCtl != null && delta != null && (
        <section className="rounded-2xl bg-surface border border-[var(--hairline)] px-4 py-3">
          <p className="text-[15px]">
            Projected race-day CTL: <strong className="tabular">{projectedRaceCtl.toFixed(1)}</strong>{" "}
            <span className={Math.abs(delta) <= 2 ? "text-good" : "text-warn"}>
              — {Math.abs(delta).toFixed(1)} {delta >= 0 ? "over" : "under"} target ({original.targetRaceCtl})
            </span>
          </p>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="rounded-2xl border border-[var(--warn)]/40 bg-surface px-4 py-3 space-y-1">
          <p className="text-[13px] font-semibold text-warn">⚠ CTL ramp &gt; 6/wk</p>
          {warnings.map((w) => (
            <p key={w.week} className="text-[13px] text-ink-2">
              Week {w.week} (from {formatShort(w.start)}): +{w.ramp.toFixed(1)}/wk
            </p>
          ))}
        </section>
      )}

      {dplusFlags.length > 0 && (
        <section className="rounded-2xl border border-[var(--warn)]/40 bg-surface px-4 py-3 space-y-1">
          <p className="text-[13px] font-semibold text-warn">⚠ Weekend D+ jump &gt; 20%</p>
          {dplusFlags.map((f) => (
            <p key={f.week} className="text-[13px] text-ink-2">
              Week {f.week} (from {formatShort(f.start)}): +{Math.round(f.jumpPct)}% vs prior week
            </p>
          ))}
        </section>
      )}

      <section>
        <h2 className="text-[13px] uppercase tracking-wide text-muted mb-2">Coach decisions</h2>
        {changelog.length === 0 ? (
          <p className="text-[13px] text-muted">No adjustments yet — on the original plan.</p>
        ) : (
          <ul className="space-y-2">
            {[...changelog].reverse().map((entry, i) => (
              <li key={i}>
                <details className="rounded-xl bg-surface border border-[var(--hairline)] px-4 py-2.5">
                  <summary className="text-[14px] cursor-pointer list-none flex justify-between gap-2">
                    <span className="font-medium">{entry.change}</span>
                    <span className="text-muted text-[12px] shrink-0 tabular">{formatShort(entry.date)}</span>
                  </summary>
                  <p className="text-[13px] text-ink-2 mt-2">{entry.reason}</p>
                  <p className="text-[12px] text-muted mt-1">affects {entry.affects.map(formatShort).join(", ")}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
