import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityLine } from "@/components/activity-line";
import { SessionCard } from "@/components/session-card";
import { loadCurrentPlan, loadSession } from "@/lib/data";
import { formatShort, formatWeekday, todayIso } from "@/lib/dates";
import { getActivities } from "@/lib/icu";
import { weekFor } from "@/lib/plan-utils";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const session = loadSession(date);
  if (!session) notFound();

  const plan = loadCurrentPlan();
  const week = weekFor(plan, date);
  const today = todayIso();
  const activities = date <= today ? ((await getActivities(date, date)) ?? []) : [];

  return (
    <div className="space-y-4 md:max-w-2xl md:mx-auto">
      <header className="flex items-baseline justify-between">
        <Link
          href={week ? `/week?w=${week.week}` : "/week"}
          className="text-[13px] font-medium text-accent"
        >
          ‹ Week{week ? ` ${week.week}` : ""}
        </Link>
        <p className="text-[13px] text-muted">
          {formatWeekday(date)} {formatShort(date)}
          {date === today && <span className="text-accent"> · today</span>}
        </p>
      </header>

      <SessionCard session={session} />

      {activities.length > 0 && (
        <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4 space-y-2">
          <h2 className="text-[11px] uppercase tracking-wide text-muted">Recorded</h2>
          {activities.map((a) => (
            <ActivityLine key={a.id} activity={a} />
          ))}
        </section>
      )}
    </div>
  );
}
