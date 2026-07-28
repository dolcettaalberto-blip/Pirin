"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncIcu } from "@/app/actions";

const LAST_SYNC_KEY = "pirin:lastSync";

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

type CopyState = "idle" | "working" | "done" | "error";

export function SyncReview() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Resolved after mount: reading window during render would desync hydration.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setLastSync(localStorage.getItem(LAST_SYNC_KEY));
    setOrigin(window.location.origin);
  }, []);

  function onSync() {
    setError(null);
    startTransition(async () => {
      try {
        const { syncedAt } = await syncIcu();
        localStorage.setItem(LAST_SYNC_KEY, syncedAt);
        setLastSync(syncedAt);
        router.refresh();
      } catch {
        setError("Sync failed — check the connection and try again.");
      }
    });
  }

  async function onCopyPrompt() {
    setCopy("working");
    setError(null);
    try {
      const res = await fetch("/api/digest?days=21&prompt=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await navigator.clipboard.writeText(await res.text());
      setCopy("done");
      setTimeout(() => setCopy("idle"), 4000);
    } catch (e) {
      setCopy("error");
      setError(e instanceof Error ? e.message : "copy failed");
    }
  }

  const digestUrl = `${origin}/api/digest`;
  const shortPrompt = `Fetch ${digestUrl} — that is a live digest of my intervals.icu wellness and activity data plus my Pirin Extreme plan state. Review my progress: readiness trend, adherence, descent/ITB load, race-day CTL trajectory, and what to change in the next 7 days. If you adjust the plan, edit data/current-plan.json and the affected data/sessions/*.json, append to data/changelog.json, then commit and push.`;

  return (
    <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] uppercase tracking-wide text-muted">Sync &amp; coach review</h2>
        <span className="text-[11px] text-muted">synced {relative(lastSync)}</span>
      </div>

      <button
        onClick={onSync}
        disabled={pending}
        className="w-full rounded-xl bg-accent text-white py-3 font-semibold text-[15px] active:opacity-80 disabled:opacity-60"
      >
        {pending ? "Pulling from intervals.icu…" : "Sync intervals.icu"}
      </button>

      <p className="text-[12px] text-ink-2 leading-snug">
        Pulls fresh wellness and activities now instead of waiting for the hourly refresh. Then send
        the data to your coaching project:
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={onCopyPrompt}
          className={`rounded-xl py-3 font-semibold text-[14px] active:opacity-80 ${
            copy === "done" ? "bg-surface-2 text-good" : "bg-surface-2 text-ink"
          }`}
        >
          {copy === "idle" && "Copy review prompt"}
          {copy === "working" && "Building…"}
          {copy === "done" && "✓ Copied — paste into Claude"}
          {copy === "error" && "Retry copy"}
        </button>
        <a
          href={`https://claude.ai/new?q=${encodeURIComponent(shortPrompt)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-surface-2 text-ink py-3 font-semibold text-[14px] text-center active:opacity-80"
        >
          Open in Claude ↗
        </a>
      </div>

      {error && <p className="text-[12px] text-critical">{error}</p>}

      <details className="text-[12px] text-muted">
        <summary className="cursor-pointer">What gets sent?</summary>
        <p className="mt-1.5 leading-snug text-ink-2">
          Wellness table (HRV, RHR, sleep, CTL/ATL) and every recorded activity for the last 21 days,
          planned-vs-actual load per day, weekly vertical against the ITB ramp rule, the CTL
          projection to race day, your next 10 sessions, and recent coach decisions.
        </p>
        <p className="mt-1.5 leading-snug">
          Live feed URL (give this to the project once and it can refetch on its own):
        </p>
        <code className="mt-1 block break-all text-[11px] text-ink-2">{digestUrl}</code>
      </details>
    </section>
  );
}
