import { ReadinessCard } from "@/components/readiness-card";
import { SessionCard } from "@/components/session-card";
import { StatusStrip } from "@/components/status-strip";
import { loadCurrentPlan, loadSession } from "@/lib/data";
import { addDays, formatShort, todayIso } from "@/lib/dates";
import { getWellness, icuConfigured, type Wellness } from "@/lib/icu";
import { plannedLoadFor, weekFor } from "@/lib/plan-utils";
import { computeReadiness } from "@/lib/readiness";

export const dynamic = "force-dynamic";

function latestWithData(wellness: Wellness[], field: keyof Wellness): Wellness | null {
  return [...wellness].reverse().find((w) => w[field] != null) ?? null;
}

export default async function TodayPage() {
  const today = todayIso();
  const plan = loadCurrentPlan();
  const session = loadSession(today);
  const week = weekFor(plan, today);
  const plannedLoad = plannedLoadFor(plan, today);

  const wellness = (await getWellness(addDays(today, -45), today)) ?? [];
  const sorted = [...wellness].sort((a, b) => a.id.localeCompare(b.id));
  const todayEntry = sorted.find((w) => w.id === today) ?? null;
  const prevEntry = [...sorted].reverse().find((w) => w.id < today && w.hrv != null) ?? null;
  const rhrHistory = sorted.filter((w) => w.id < today && w.restingHR != null).map((w) => w.restingHR as number);
  const rhrBaseline = rhrHistory.length >= 7 ? rhrHistory.reduce((a, b) => a + b, 0) / rhrHistory.length : null;

  const readiness = computeReadiness({
    hrv: todayEntry?.hrv ?? null,
    restingHR: todayEntry?.restingHR ?? null,
    sleepSecs: todayEntry?.sleepSecs ?? null,
    prevHrv: prevEntry?.hrv ?? null,
    rhrBaseline,
  });

  const latestCtl = latestWithData(sorted, "ctl");
  const spark = sorted
    .filter((w) => w.ctl != null)
    .slice(-7)
    .map((w) => w.ctl as number);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Today</h1>
        <p className="text-[13px] text-muted">
          {formatShort(today)}
          {week && <> · Wk {week.week} {week.block}</>}
        </p>
      </header>

      <ReadinessCard
        readiness={readiness}
        hrv={todayEntry?.hrv ?? null}
        restingHR={todayEntry?.restingHR ?? null}
        sleepSecs={todayEntry?.sleepSecs ?? null}
      />

      {session ? (
        <SessionCard session={session} />
      ) : (
        <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4">
          <h2 className="text-lg font-semibold">{plannedLoad === 0 ? "Rest day" : "No session planned"}</h2>
          <p className="text-[13px] text-ink-2 mt-1">
            {plannedLoad === 0 ? "Full rest — recovery is training." : "No session file for today yet."}
          </p>
        </section>
      )}

      <StatusStrip ctl={latestCtl?.ctl ?? null} atl={latestWithData(sorted, "atl")?.atl ?? null} spark={spark} />

      {!icuConfigured() && (
        <p className="text-[12px] text-muted text-center">
          intervals.icu not connected — set ICU_API_KEY and ICU_ATHLETE_ID.
        </p>
      )}
    </div>
  );
}
