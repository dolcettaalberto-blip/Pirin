import { NextResponse } from "next/server";
import { dispatchWorkflow, githubConfigured } from "@/lib/github";

/**
 * Fires the morning-briefing GitHub Action on demand (the "Generate briefing"
 * button on Today). The workflow itself does the intervals.icu + Claude call and
 * commits data/briefing.json — this route only requests that run and returns
 * immediately; the new briefing lands a minute or so later on refresh.
 */
export async function POST() {
  if (!githubConfigured()) {
    return NextResponse.json(
      { error: "GitHub writes are not configured (set GITHUB_TOKEN and GITHUB_REPO)." },
      { status: 503 }
    );
  }
  try {
    await dispatchWorkflow("morning-briefing.yml");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
