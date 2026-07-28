"use server";

import { updateTag } from "next/cache";
import { ICU_CACHE_TAG } from "@/lib/icu";

/**
 * Force-expire every cached intervals.icu read so the next render pulls fresh
 * wellness + activities. `updateTag` is Server-Action-only and expires
 * immediately (rather than serving stale-while-revalidate), which is what a
 * manual "Sync" button should do.
 */
export async function syncIcu(): Promise<{ syncedAt: string }> {
  updateTag(ICU_CACHE_TAG);
  return { syncedAt: new Date().toISOString() };
}
