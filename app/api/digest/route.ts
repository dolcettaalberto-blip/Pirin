import { NextRequest, NextResponse } from "next/server";
import { buildDigest, reviewPrompt } from "@/lib/digest";

export const dynamic = "force-dynamic";

/**
 * The coaching project's data feed: one URL replacing the manual
 * wellness.csv + activities.csv downloads. Markdown by default;
 * `?prompt=1` wraps it in the full review prompt.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const days = Number(params.get("days") ?? 21);
  const digest = await buildDigest({ days: Number.isFinite(days) ? days : 21 });
  const body = params.get("prompt")
    ? reviewPrompt(digest, `${request.nextUrl.origin}/api/digest`)
    : digest;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
  });
}
