#!/usr/bin/env node
// Fetches intervals.icu wellness/activities, reads the repo's plan/session
// context, asks Claude for a coach-style morning briefing, and writes
// data/briefing.json. Runs on GitHub Actions (see ../workflows/morning-briefing.yml),
// deliberately outside any Anthropic-hosted session so it isn't subject to
// Cowork's cloud network/push restrictions.

import fs from "node:fs";

const ICU_API_KEY = process.env.ICU_API_KEY;
const ICU_ATHLETE_ID = process.env.ICU_ATHLETE_ID || "i434859";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ICU_API_KEY) throw new Error("ICU_API_KEY secret is not set");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set");

function todayIso() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function addDaysIso(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function icuGet(path) {
  const auth = Buffer.from(`API_KEY:${ICU_API_KEY}`).toString("base64");
  const res = await fetch(`https://intervals.icu${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`intervals.icu ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

function readJsonIfExists(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are Alberto's trail-running coach, writing a short morning briefing for the Pirin Tracker dashboard.

Protocol you apply:
- Readiness: GREEN = HRV >= 48 AND RHR <= 50 AND sleep > 6h. AMBER = HRV low-40s, overnight HRV drop >10, RHR >= baseline+4, or sleep <5.5h. RED = HRV <40 with elevated RHR and poor sleep. Amber overrides green.
- ITB: any lateral knee signal on a descent session is a hard stop, no negotiation. Single-day descent is capped at 2000m in build weeks, 1100m in recovery weeks. Eccentric descent load is the primary re-injury vector.
- Altitude (roughly >=1950m): resting-HR elevation there is noise, not a fatigue signal; HRV is the more meaningful marker at altitude.
- Load-model discrepancy: intervals.icu's load undercounts short high-intensity intervals by roughly 20-25%, and treadmill incline sessions similarly. For those session types, RPE and reps completed are more reliable quality signals than the raw load number.
- Grey-zone drift: watch for incremental load-creep across consecutive days, or a pattern of underdelivering prescribed hard sessions while overdelivering easy/mountain days. Name this explicitly if the recent changelog or wellness trend shows it.
- You NEVER change the plan yourself. If a change looks warranted, put it in suggestedChange as a proposal for Alberto to confirm separately — never assert it as already decided.
- Tone: direct and concise, like a coach relaying a call, not a wellness app. Lead with the verdict. Ground every claim in the actual numbers you were given below — never invent a figure.

Call the write_briefing tool with today's briefing. Do not write any other text.`;

const BRIEFING_TOOL = {
  name: "write_briefing",
  description: "Write today's coaching briefing for the Pirin Tracker dashboard.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "One line, e.g. 'AMBER — cut tempo to 4 reps'" },
      summary: { type: "string", description: "2-4 sentences" },
      flags: {
        type: "array",
        items: { type: "string" },
        description: "0-3 short notes on nuance beyond the mechanical rule; omit entirely if none",
      },
      suggestedChange: {
        type: "string",
        description: "A concrete proposal for Alberto to confirm separately, or empty string if none",
      },
    },
    required: ["headline", "summary"],
  },
};

async function main() {
  const today = todayIso();
  const since = addDaysIso(today, -30);

  const [wellness, activities] = await Promise.all([
    icuGet(`/api/v1/athlete/${ICU_ATHLETE_ID}/wellness?oldest=${since}&newest=${today}`),
    icuGet(`/api/v1/athlete/${ICU_ATHLETE_ID}/activities?oldest=${since}&newest=${today}`),
  ]);

  const plan = JSON.parse(fs.readFileSync("data/current-plan.json", "utf8"));
  const changelog = JSON.parse(fs.readFileSync("data/changelog.json", "utf8"));
  const session = readJsonIfExists(`data/sessions/${today}.json`);

  const recentWellness = Array.isArray(wellness) ? wellness.slice(-10) : wellness;
  const recentChangelog = Array.isArray(changelog) ? changelog.slice(-8) : changelog;

  const userPrompt = `Today: ${today}
Race target: ${plan.race.name}, ${plan.race.date}, ${plan.race.distanceKm}km / ${plan.race.dPlus}m D+

Recent wellness (last 10 entries, oldest first):
${JSON.stringify(recentWellness, null, 1)}

Recent activities (last 30 days):
${JSON.stringify(activities, null, 1)}

Current living plan:
${JSON.stringify(plan, null, 1)}

Today's prescribed session (null = rest day or not written yet):
${JSON.stringify(session, null, 1)}

Recent coach decisions (changelog, last 8 entries):
${JSON.stringify(recentChangelog, null, 1)}

Write today's briefing.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [BRIEFING_TOOL],
      tool_choice: { type: "tool", name: "write_briefing" },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API -> ${res.status} ${await res.text()}`);
  const data = await res.json();

  const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === "write_briefing");
  if (!toolUse) {
    throw new Error(
      `Claude did not call write_briefing (stop_reason: ${data.stop_reason}). Full response:\n${JSON.stringify(data)}`
    );
  }
  const parsed = toolUse.input ?? {};

  const briefing = {
    date: today,
    generatedAt: new Date().toISOString(),
    headline: String(parsed.headline ?? "").trim(),
    summary: String(parsed.summary ?? "").trim(),
    flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
    suggestedChange: parsed.suggestedChange ? String(parsed.suggestedChange).trim() || null : null,
  };
  if (!briefing.headline || !briefing.summary) {
    throw new Error(`Model response missing headline or summary:\n${JSON.stringify(parsed)}`);
  }

  fs.writeFileSync("data/briefing.json", JSON.stringify(briefing, null, 2) + "\n");
  console.log("Wrote data/briefing.json:", briefing.headline);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
