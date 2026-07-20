import "server-only";

const BASE = "https://intervals.icu/api/v1";

export type Wellness = {
  id: string; // ISO date
  ctl: number | null;
  atl: number | null;
  hrv: number | null;
  restingHR: number | null;
  sleepSecs: number | null;
  readiness: number | null;
};

export type Activity = {
  id: string;
  start_date_local: string;
  name: string | null;
  type: string | null;
  icu_training_load: number | null;
  distance: number | null;
  total_elevation_gain: number | null;
  moving_time: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  icu_rpe: number | null;
};

function credentials(): { key: string; athleteId: string } | null {
  const key = process.env.ICU_API_KEY;
  const athleteId = process.env.ICU_ATHLETE_ID;
  if (!key || !athleteId) return null;
  return { key, athleteId };
}

export function icuConfigured(): boolean {
  return credentials() !== null;
}

async function icuGet<T>(path: string): Promise<T | null> {
  const creds = credentials();
  if (!creds) return null;
  const res = await fetch(`${BASE}/athlete/${creds.athleteId}${path}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(`API_KEY:${creds.key}`).toString("base64"),
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    console.error(`intervals.icu GET ${path} failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return (await res.json()) as T;
}

export async function getWellness(oldest: string, newest: string): Promise<Wellness[] | null> {
  return icuGet<Wellness[]>(`/wellness?oldest=${oldest}&newest=${newest}`);
}

export async function getActivities(oldest: string, newest: string): Promise<Activity[] | null> {
  return icuGet<Activity[]>(`/activities?oldest=${oldest}&newest=${newest}`);
}

/**
 * The app's single write operation: create a WORKOUT calendar event on
 * intervals.icu (which syncs to Garmin Connect as a structured workout).
 * `description` is intervals.icu native workout step syntax.
 */
export async function createWorkoutEvent(args: {
  date: string;
  name: string;
  description: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const creds = credentials();
  if (!creds) return { ok: false, error: "intervals.icu not configured (ICU_API_KEY / ICU_ATHLETE_ID)" };
  const res = await fetch(`${BASE}/athlete/${creds.athleteId}/events`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`API_KEY:${creds.key}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category: "WORKOUT",
      type: "Run",
      start_date_local: `${args.date}T00:00:00`,
      name: args.name,
      description: args.description,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`intervals.icu POST /events failed: ${res.status} ${text}`);
    return { ok: false, error: `intervals.icu returned ${res.status}` };
  }
  const json = (await res.json()) as { id: number };
  return { ok: true, id: json.id };
}
