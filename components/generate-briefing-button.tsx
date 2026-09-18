"use client";

import { useState } from "react";

type State = "idle" | "sending" | "requested" | "error";

export function GenerateBriefingButton({ hasToday }: { hasToday: boolean }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/briefing/trigger", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setState("requested");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setState("error");
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={trigger}
        disabled={state === "sending" || state === "requested"}
        className={`w-full rounded-xl py-2.5 font-semibold text-[13px] transition-colors ${
          state === "requested"
            ? "bg-surface-2 text-good"
            : "bg-surface-2 text-ink active:opacity-80 disabled:opacity-60"
        }`}
      >
        {state === "idle" && (hasToday ? "Regenerate briefing" : "Generate briefing")}
        {state === "sending" && "Requesting…"}
        {state === "requested" && "✓ Requested — refresh in ~30s"}
        {state === "error" && "Retry"}
      </button>
      {state === "error" && error && <p className="text-critical text-[12px] mt-1.5 text-center">{error}</p>}
    </div>
  );
}
