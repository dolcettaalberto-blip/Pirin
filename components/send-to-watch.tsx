"use client";

import { useState } from "react";

type State = "idle" | "sending" | "sent" | "error";

export function SendToWatch({ date }: { date: string }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/icu/send-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setState("error");
    }
  }

  return (
    <div>
      <button
        onClick={send}
        disabled={state === "sending" || state === "sent"}
        className={`w-full rounded-xl py-3 font-semibold text-[15px] transition-colors ${
          state === "sent"
            ? "bg-surface-2 text-good"
            : "bg-accent text-white active:opacity-80 disabled:opacity-60"
        }`}
      >
        {state === "idle" && "Send to watch"}
        {state === "sending" && "Sending…"}
        {state === "sent" && "✓ On intervals.icu — syncing to Garmin"}
        {state === "error" && "Retry send"}
      </button>
      {state === "error" && error && <p className="text-critical text-[12px] mt-1.5 text-center">{error}</p>}
    </div>
  );
}
