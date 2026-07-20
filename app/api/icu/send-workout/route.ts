import { NextRequest, NextResponse } from "next/server";
import { loadSession } from "@/lib/data";
import { createWorkoutEvent } from "@/lib/icu";

/**
 * The app's only write operation: push a session to intervals.icu as a
 * structured workout (intervals.icu syncs it to Garmin Connect).
 */
export async function POST(request: NextRequest) {
  let date: unknown;
  try {
    ({ date } = await request.json());
  } catch {
    return NextResponse.json({ error: "body must be JSON: { date: 'YYYY-MM-DD' }" }, { status: 400 });
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const session = loadSession(date);
  if (!session) {
    return NextResponse.json({ error: `no session file for ${date}` }, { status: 404 });
  }
  const result = await createWorkoutEvent({
    date: session.date,
    name: session.title,
    description: session.icuWorkoutText,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, eventId: result.id });
}
