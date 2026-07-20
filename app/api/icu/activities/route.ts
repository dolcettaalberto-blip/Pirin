import { NextRequest, NextResponse } from "next/server";
import { getActivities } from "@/lib/icu";
import { addDays, todayIso } from "@/lib/dates";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const today = todayIso();
  const oldest = request.nextUrl.searchParams.get("oldest") ?? addDays(today, -45);
  const newest = request.nextUrl.searchParams.get("newest") ?? today;
  if (!ISO_DATE.test(oldest) || !ISO_DATE.test(newest)) {
    return NextResponse.json({ error: "oldest/newest must be YYYY-MM-DD" }, { status: 400 });
  }
  const data = await getActivities(oldest, newest);
  if (data === null) {
    return NextResponse.json({ error: "intervals.icu not configured or unreachable" }, { status: 503 });
  }
  return NextResponse.json(data);
}
