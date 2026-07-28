import { NextRequest, NextResponse } from "next/server";
import { buildDigest, reviewPrompt } from "@/lib/digest";

export const dynamic = "force-dynamic";

/**
 * The coaching project's data feed: one URL replacing the manual
 * wellness.csv + activities.csv downloads. Markdown by default;
 * `?prompt=1` wraps it in the full review prompt.
 */
/**
 * Public origin of this deployment. Behind Railway's proxy `nextUrl.origin` is
 * the container's internal bind address (https://localhost:8080), so the
 * forwarded headers are the only reliable source for a URL the coach can refetch.
 */
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const days = Number(params.get("days") ?? 21);
  const digest = await buildDigest({ days: Number.isFinite(days) ? days : 21 });
  const body = params.get("prompt")
    ? reviewPrompt(digest, `${publicOrigin(request)}/api/digest`)
    : digest;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
  });
}
