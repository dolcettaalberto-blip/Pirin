import "server-only";
import { buildDigest } from "./digest";
import { listSessionDates, loadChangelog, loadCurrentPlan, loadOriginalPlan, loadSession } from "./data";
import { addDays, todayIso } from "./dates";
import { commitFiles, getRepoJson, githubConfigured } from "./github";
import { getActivities, getWellness, icuConfigured } from "./icu";
import { applyUpdate, validateState, type PlanUpdate, type RepoState } from "./plan-validate";
import { BriefingSchema, type Changelog, type Plan, type Session } from "./schemas";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const DATE = { type: "string", description: "ISO date, YYYY-MM-DD" };

export const TOOLS: ToolDef[] = [
  {
    name: "get_wellness",
    title: "Get wellness data",
    description:
      "Daily wellness from intervals.icu for a date range: HRV, resting HR, sleep seconds and score, " +
      "and intervals.icu's own CTL/ATL. This is the data that used to be downloaded as wellness.csv. " +
      "Always live, never cached.",
    inputSchema: {
      type: "object",
      properties: { oldest: DATE, newest: DATE },
      required: ["oldest", "newest"],
    },
  },
  {
    name: "get_activities",
    title: "Get activities",
    description:
      "Recorded activities from intervals.icu for a date range, with training load, distance, elevation " +
      "gain, moving time, average/max heart rate and RPE. This replaces activities.csv. Always live.",
    inputSchema: {
      type: "object",
      properties: { oldest: DATE, newest: DATE },
      required: ["oldest", "newest"],
    },
  },
  {
    name: "get_digest",
    title: "Get training digest",
    description:
      "A ready-made analysis digest: current CTL/ATL/TSB, projected start-line CTL vs target, wellness " +
      "table, planned-vs-actual load per day, weekly vertical against the descent-ramp rule, upcoming " +
      "sessions and recent coach decisions. Start here for a progress review.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "number", description: "Window length in days (default 21, max 400)" } },
    },
  },
  {
    name: "get_plan",
    title: "Get the training plan",
    description:
      "The living plan (current-plan.json), the frozen original for reference, an index of every session " +
      "file, and the coach changelog. Read this before proposing changes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_session",
    title: "Get one session",
    description: "The full session document for a date: steps, targets, coach notes and the Garmin workout text.",
    inputSchema: { type: "object", properties: { date: DATE }, required: ["date"] },
  },
  {
    name: "update_plan",
    title: "Update the plan",
    description:
      "Push a plan change to Pirin Tracker. Patches weeks in current-plan.json, writes or deletes session " +
      "files, and appends a changelog entry — all in ONE commit to the GitHub repo, which triggers a Railway " +
      "redeploy (live in about two minutes). The whole resulting state is validated first (schemas, Monday " +
      "week starts, estimatedLoad matching plannedDailyLoad, frozen race/baseline fields); if anything fails " +
      "nothing is committed and the errors are returned. A changelog entry is mandatory. " +
      "Read data/SCHEMA.md conventions via get_plan first.",
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "array",
          description: "Patches to plan weeks, identified by week number. Only the fields you pass are changed.",
          items: {
            type: "object",
            properties: {
              week: { type: "number" },
              block: { type: "string" },
              runKm: { type: "number" },
              weekendDplus: { type: "number" },
              plannedDailyLoad: {
                type: "object",
                description: "Partial map of weekday -> load; merged into the existing map.",
                properties: {
                  mon: { type: "number" }, tue: { type: "number" }, wed: { type: "number" },
                  thu: { type: "number" }, fri: { type: "number" }, sat: { type: "number" },
                  sun: { type: "number" },
                },
              },
            },
            required: ["week"],
          },
        },
        sessions: {
          type: "object",
          description:
            "Full session documents keyed by ISO date, e.g. {\"2026-08-05\": {date, type, title, terrain, " +
            "estimatedLoad, steps, coachNotes, icuWorkoutText}}. Replaces the existing file for that date. " +
            "estimatedLoad must equal that day's plannedDailyLoad — patch the week in the same call.",
        },
        removeSessions: {
          type: "array",
          description: "Dates whose session file should be deleted (turning them into rest days).",
          items: DATE,
        },
        dryRun: {
          type: "boolean",
          description:
            "Validate and report what would change WITHOUT committing. Use this to check a change before " +
            "pushing it, or when the athlete has not approved it yet.",
        },
        changelog: {
          type: "object",
          description: "Mandatory decision log entry, appended to changelog.json.",
          properties: {
            date: DATE,
            change: { type: "string", description: "What changed, concretely." },
            reason: { type: "string", description: "Why — this is what the athlete reads later." },
            affects: { type: "array", items: DATE },
          },
          required: ["date", "change", "reason", "affects"],
        },
      },
      required: ["changelog"],
    },
  },
  {
    name: "post_briefing",
    title: "Post the morning briefing",
    description:
      "Write today's coach narrative to Pirin Tracker's Today tab: a one-line readiness headline, a short " +
      "summary, any nuanced flags (grey-zone drift, altitude HR override, ITB caution, load-model discrepancy, " +
      "etc.), and an optional suggested plan change for the athlete to confirm. This tool NEVER edits the plan " +
      "or session files itself — a suggestedChange is a proposal the athlete must approve separately via " +
      "update_plan. One commit; data/briefing.json holds only the latest briefing (overwrites the prior day's).",
    inputSchema: {
      type: "object",
      properties: {
        date: DATE,
        headline: { type: "string", description: "One line, e.g. 'AMBER — cut tempo to 4 reps'" },
        summary: { type: "string", description: "2-4 sentences, coach narrative grounded in the actual data pulled" },
        flags: {
          type: "array",
          items: { type: "string" },
          description: "Nuanced considerations noticed beyond the mechanical readiness rule (grey-zone drift, altitude context, etc.)",
        },
        suggestedChange: {
          type: "string",
          description: "A plan change to propose, if any — informational only, athlete confirms separately",
        },
      },
      required: ["date", "headline", "summary"],
    },
  },
];

function text(s: string) {
  return { content: [{ type: "text", text: s }] };
}
function fail(s: string) {
  return { content: [{ type: "text", text: s }], isError: true };
}

function requireRange(args: Record<string, unknown>): { oldest: string; newest: string } | string {
  const oldest = String(args.oldest ?? "");
  const newest = String(args.newest ?? "");
  if (!ISO.test(oldest) || !ISO.test(newest)) return "oldest and newest must be ISO dates (YYYY-MM-DD)";
  if (oldest > newest) return "oldest must be on or before newest";
  return { oldest, newest };
}

export async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_wellness": {
      const range = requireRange(args);
      if (typeof range === "string") return fail(range);
      if (!icuConfigured()) return fail("intervals.icu is not configured on this deployment.");
      const rows = await getWellness(range.oldest, range.newest, true);
      if (!rows) return fail("intervals.icu request failed.");
      const lean = rows
        .map((w) => ({
          date: w.id, hrv: w.hrv, restingHR: w.restingHR, sleepSecs: w.sleepSecs,
          sleepScore: w.sleepScore, readiness: w.readiness, ctl: w.ctl, atl: w.atl,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return text(JSON.stringify({ count: lean.length, rows: lean }, null, 1));
    }

    case "get_activities": {
      const range = requireRange(args);
      if (typeof range === "string") return fail(range);
      if (!icuConfigured()) return fail("intervals.icu is not configured on this deployment.");
      const rows = await getActivities(range.oldest, range.newest, true);
      if (!rows) return fail("intervals.icu request failed.");
      const lean = rows
        .map((a) => ({
          date: a.start_date_local.slice(0, 10), name: a.name, type: a.type,
          load: a.icu_training_load, km: a.distance == null ? null : +(a.distance / 1000).toFixed(2),
          dPlus: a.total_elevation_gain == null ? null : Math.round(a.total_elevation_gain),
          movingSecs: a.moving_time, avgHR: a.average_heartrate, maxHR: a.max_heartrate, rpe: a.icu_rpe,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return text(JSON.stringify({ count: lean.length, rows: lean }, null, 1));
    }

    case "get_digest": {
      const days = Number(args.days ?? 21);
      return text(await buildDigest({ days: Number.isFinite(days) ? days : 21 }));
    }

    case "get_plan": {
      const current = loadCurrentPlan();
      const index = listSessionDates().map((d) => {
        const s = loadSession(d)!;
        return { date: d, type: s.type, title: s.title, estimatedLoad: s.estimatedLoad };
      });
      return text(
        JSON.stringify(
          {
            today: todayIso(),
            conventions: {
              weeks: "Monday -> Sunday; plannedDailyLoad keys are calendar weekdays of that week",
              raceExcluded:
                "Race day is excluded from the CTL simulation, the ramp warning and the D+ flag; it may carry an honest load",
              frozen: "plan.json is the frozen reference; only its `race` block may be corrected, in both files together",
              estimatedLoad: "a session's estimatedLoad must equal that date's plannedDailyLoad",
            },
            currentPlan: current,
            frozenPlan: loadOriginalPlan(),
            sessions: index,
            changelog: loadChangelog(),
          },
          null,
          1
        )
      );
    }

    case "get_session": {
      const date = String(args.date ?? "");
      if (!ISO.test(date)) return fail("date must be an ISO date (YYYY-MM-DD)");
      const s = loadSession(date);
      return s ? text(JSON.stringify(s, null, 1)) : fail(`No session file for ${date} (rest day, or not written yet).`);
    }

    case "update_plan":
      return updatePlan(args as unknown as PlanUpdate);

    case "post_briefing":
      return postBriefing(args as { date?: unknown; headline?: unknown; summary?: unknown; flags?: unknown; suggestedChange?: unknown });

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

async function updatePlan(update: PlanUpdate & { dryRun?: boolean }) {
  const dryRun = update?.dryRun === true;
  if (!dryRun && !githubConfigured())
    return fail(
      "Writing to Pirin Tracker is not configured. Set GITHUB_TOKEN (fine-grained, Contents: read+write on the " +
        "Pirin repo) and GITHUB_REPO (owner/name) in the Railway service variables. " +
        "You can still call this tool with dryRun:true to validate a change."
    );
  if (!update?.changelog) return fail("A `changelog` entry is required for every plan update.");

  // Read the files we mutate cumulatively from the branch HEAD rather than the
  // container's deploy snapshot, so an update never silently reverts a change
  // that has not redeployed yet. A dry run falls back to the local snapshot.
  let currentPlan: Plan;
  let changelog: Changelog;
  try {
    if (githubConfigured()) {
      [currentPlan, changelog] = await Promise.all([
        getRepoJson<Plan>("data/current-plan.json"),
        getRepoJson<Changelog>("data/changelog.json"),
      ]);
    } else {
      currentPlan = loadCurrentPlan();
      changelog = loadChangelog();
    }
  } catch (e) {
    return fail(`Could not read the repo: ${e instanceof Error ? e.message : String(e)}`);
  }

  const sessions: Record<string, Session> = {};
  for (const d of listSessionDates()) {
    const s = loadSession(d);
    if (s) sessions[d] = s;
  }

  const before: RepoState = { frozenPlan: loadOriginalPlan(), currentPlan, sessions, changelog };
  const after = applyUpdate(before, update);
  const errors = validateState(after);
  if (errors.length > 0) {
    return fail(`Update rejected — nothing was committed.\n\n${errors.map((e) => `- ${e}`).join("\n")}`);
  }

  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  const changedWeeks = (update.weeks ?? []).map((w) => `week ${w.week}`);
  const changes = [
    { path: "data/current-plan.json", content: json(after.currentPlan) },
    { path: "data/changelog.json", content: json(after.changelog) },
    ...Object.entries(update.sessions ?? {}).map(([date]) => ({
      path: `data/sessions/${date}.json`,
      content: json(after.sessions[date]),
    })),
    ...(update.removeSessions ?? []).map((date) => ({
      path: `data/sessions/${date}.json`,
      content: null,
    })),
  ];

  if (dryRun) {
    return text(
      [
        "Dry run — valid, nothing committed.",
        "",
        `Would change ${changes.length} file(s):`,
        ...changes.map((c) => `  ${c.content === null ? "delete" : "write "} ${c.path}`),
        ...(changedWeeks.length ? [``, `Plan weeks patched: ${changedWeeks.join(", ")}`] : []),
        ``,
        `Changelog entry: ${update.changelog.change}`,
      ].join("\n")
    );
  }

  try {
    const commit = await commitFiles({
      changes,
      message: `coach: ${update.changelog.change}\n\n${update.changelog.reason}\n\nvia Pirin Tracker MCP`,
    });
    return text(
      [
        `Committed ${changes.length} file(s): ${commit.url}`,
        `Railway redeploys automatically — live in about two minutes.`,
        ``,
        `Changed: ${changes.map((c) => c.path.replace("data/", "")).join(", ")}`,
      ].join("\n")
    );
  } catch (e) {
    return fail(`Validation passed but the commit failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function postBriefing(args: {
  date?: unknown;
  headline?: unknown;
  summary?: unknown;
  flags?: unknown;
  suggestedChange?: unknown;
}) {
  if (!githubConfigured())
    return fail(
      "Writing to Pirin Tracker is not configured. Set GITHUB_TOKEN (fine-grained, Contents: read+write on the " +
        "Pirin repo) and GITHUB_REPO (owner/name) in the Railway service variables."
    );

  const candidate = {
    date: args.date,
    generatedAt: new Date().toISOString(),
    headline: args.headline,
    summary: args.summary,
    flags: Array.isArray(args.flags) ? args.flags : [],
    suggestedChange: typeof args.suggestedChange === "string" ? args.suggestedChange : null,
  };
  const parsed = BriefingSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail(
      `Briefing rejected \u2014 nothing was committed.\n\n${parsed.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`
    );
  }

  try {
    const commit = await commitFiles({
      changes: [{ path: "data/briefing.json", content: JSON.stringify(parsed.data, null, 2) + "\n" }],
      message: `coach: morning briefing for ${parsed.data.date} \u2014 ${parsed.data.headline}`,
    });
    return text(
      [`Committed data/briefing.json: ${commit.url}`, `Railway redeploys automatically \u2014 live in about two minutes.`].join(
        "\n"
      )
    );
  } catch (e) {
    return fail(`Commit failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export { addDays };
