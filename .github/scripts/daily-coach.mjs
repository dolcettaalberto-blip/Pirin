#!/usr/bin/env node
// Daily coach: pulls intervals.icu, reviews vs plan, writes briefing.json and,
// when warranted, edits current-plan.json + session files + changelog directly.
// Code-level guardrails reject unsafe edits; the workflow then runs vitest and
// only commits plan edits if tests pass. See ../workflows/daily-coach.yml.

import fs from "node:fs";

const { ICU_API_KEY, ANTHROPIC_API_KEY } = process.env;
const ICU_ATHLETE_ID = process.env.ICU_ATHLETE_ID || "i434859";
const MODEL = process.env.COACH_MODEL || "claude-opus-5-5";
if (!ICU_API_KEY || !ANTHROPIC_API_KEY) throw new Error("ICU_API_KEY / ANTHROPIC_API_KEY missing");

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

async function icuGet(path) {
  const auth = Buffer.from(`API_KEY:${ICU_API_KEY}`).toString("base64");
  const r = await fetch(`https://intervals.icu${path}`, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error(`icu ${path} -> ${r.status}`);
  return r.json();
}

function locate(plan, date) {
  for (const w of plan.weeks) {
    const i = diffDays(w.start, date);
    if (i >= 0 && i < 7) return { week: w, key: DAYS[i] };
  }
  return null;
}
const loadOn = (plan, date) => { const l = locate(plan, date); return l ? l.week.plannedDailyLoad[l.key] : 0; };
const weekTotal = (w) => DAYS.reduce((s, k) => s + w.plannedDailyLoad[k], 0);

const SCHEMA = fs.readFileSync("data/SCHEMA.md", "utf8");
const CONTEXT = fs.readFileSync(".github/scripts/coach-context.md", "utf8");

const SYSTEM = `You are Alberto's trail-running coach. Every morning you review his intervals.icu data against the living plan, write the Today-tab briefing, and you MAY edit the plan directly. Your edits are published without human review, so they must be correct and justified by the numbers.

Readiness: GREEN = HRV >= 55 AND RHR <= 51 AND sleep > 6h. AMBER = HRV < 55, overnight HRV drop > 10, RHR >= 52, or sleep < 5.5h: cut today's/tomorrow's load (fewer reps, shorter, drop the spin). RED = fever/illness (rest) or HRV < 45 with RHR 53+ and poor sleep. Amber overrides green.
Load model: icu undercounts short intervals and treadmill incline sessions by 20-25%; judge those on reps and RPE.
If an activity is already logged today: grade it against today's prescription first (reps, HR bands, cadence, RPE, feel, drift), then decide forward changes. Today is then locked.
If nothing is logged today: gate today's session on readiness.

When to edit: only when readiness, a missed/over-delivered session, or a clear opportunity to push changes what the next days should be. Otherwise sessions = [] and changelog = null. Never churn sessions for wording. Keep a race-week taper intact unless readiness forces a cut.
Session rules: follow the schema below exactly (steps, zones with bpm, icuWorkoutText syntax with blank lines around repeat blocks, coachNotes lines EXECUTION/GYM/FUEL/GARMIN/STOP RULE/WHY, short). estimatedLoad is the icu load target; the plan's daily load is set from it automatically. Rest day = put the date in restDates.
Briefing: verdict first, every number from the data, no invented figures. suggestedChange = one line describing what you applied (or null).
Changelog reason must state the data that drove it and "base call was X" when the +10% bias applied.

--- Athlete context ---
${CONTEXT}

--- Repo schema (authoritative) ---
${SCHEMA}`;

const TOOL = {
  name: "coach_day",
  description: "Write today's briefing and any plan edits.",
  input_schema: {
    type: "object",
    properties: {
      briefing: {
        type: "object",
        properties: {
          headline: { type: "string" }, summary: { type: "string" },
          flags: { type: "array", items: { type: "string" } }, suggestedChange: { type: ["string", "null"] },
        },
        required: ["headline", "summary"],
      },
      sessions: { type: "array", description: "Full session objects to create or overwrite (schema format)", items: { type: "object" } },
      restDates: { type: "array", items: { type: "string" }, description: "Dates to turn into rest days" },
      changelog: { type: ["object", "null"], properties: { change: { type: "string" }, reason: { type: "string" } } },
    },
    required: ["briefing", "sessions", "changelog"],
  },
};

async function main() {
  const since = addDays(today, -28);
  const [wellness, activities] = await Promise.all([
    icuGet(`/api/v1/athlete/${ICU_ATHLETE_ID}/wellness?oldest=${since}&newest=${today}`),
    icuGet(`/api/v1/athlete/${ICU_ATHLETE_ID}/activities?oldest=${since}&newest=${today}`),
  ]);
  const plan = readJson("data/current-plan.json");
  const changelog = readJson("data/changelog.json");
  const slim = (a) => ({ date: a.start_date_local, type: a.type, name: a.name, km: +((a.distance || 0) / 1000).toFixed(1), min: Math.round((a.moving_time || 0) / 60), dplus: Math.round(a.total_elevation_gain || 0), load: a.icu_training_load, hr: a.average_heartrate, hrMax: a.max_heartrate, cadence: a.average_cadence, rpe: a.icu_rpe, feel: a.feel, description: a.description });
  const acts = activities.map(slim);
  const doneToday = acts.filter((a) => String(a.date).slice(0, 10) === today);
  const well = wellness.map((w) => ({ date: w.id, ctl: w.ctl && +w.ctl.toFixed(1), atl: w.atl && +w.atl.toFixed(1), hrv: w.hrv, rhr: w.restingHR, sleepH: w.sleepSecs && +(w.sleepSecs / 3600).toFixed(1), sleepScore: w.sleepScore, soreness: w.soreness, fatigue: w.fatigue }));
  const upcoming = {};
  for (let i = -7; i <= 14; i++) { const d = addDays(today, i); upcoming[d] = { plannedLoad: loadOn(plan, d), session: readJson(`data/sessions/${d}.json`) }; }

  const user = `Today: ${today}. ${doneToday.length ? "Activity already logged today (review mode, today locked)." : "Nothing logged yet today (pre-session mode)."}
Wellness (28d): ${JSON.stringify(well)}
Activities (28d): ${JSON.stringify(acts)}
Plan weeks: ${JSON.stringify(plan.weeks)}
Race: ${JSON.stringify(plan.race)}
Sessions -7d to +14d: ${JSON.stringify(upcoming)}
Changelog (last 8): ${JSON.stringify(changelog.slice(-8))}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, system: SYSTEM, messages: [{ role: "user", content: user }], tools: [TOOL], tool_choice: { type: "tool", name: "coach_day" } }),
  });
  if (!r.ok) throw new Error(`Anthropic -> ${r.status} ${await r.text()}`);
  const out = (await r.json()).content.find((b) => b.type === "tool_use")?.input;
  if (!out?.briefing?.headline) throw new Error("No coach_day output");

  const flags = Array.isArray(out.briefing.flags) ? out.briefing.flags.map(String) : [];
  const sessions = Array.isArray(out.sessions) ? out.sessions : [];
  const restDates = Array.isArray(out.restDates) ? out.restDates : [];
  let applied = false;

  if ((sessions.length || restDates.length) && out.changelog) {
    const reject = (why) => { flags.push(`Auto-edit rejected: ${why}`); return false; };
    const firstEditable = doneToday.length ? addDays(today, 1) : today;
    const last = addDays(plan.weeks.at(-1).start, 6);
    const next = structuredClone(plan);
    const before = Object.fromEntries(next.weeks.map((w) => [w.week, weekTotal(w)]));
    const dates = [...sessions.map((s) => s.date), ...restDates];
    let ok = true;
    for (const d of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < firstEditable || d > last || !locate(next, d)) { ok = reject(`date ${d} outside editable window`); break; }
    }
    for (const s of ok ? sessions : []) {
      const l = locate(next, s.date);
      const old = l.week.plannedDailyLoad[l.key];
      if (!Number.isInteger(s.estimatedLoad) || s.estimatedLoad < 0) { ok = reject(`bad load on ${s.date}`); break; }
      if (Math.abs(s.estimatedLoad - old) > 60) { ok = reject(`${s.date} load ${old}->${s.estimatedLoad} exceeds 60 change`); break; }
      l.week.plannedDailyLoad[l.key] = s.estimatedLoad;
    }
    for (const d of ok ? restDates : []) { const l = locate(next, d); l.week.plannedDailyLoad[l.key] = 0; }
    if (ok) for (const w of next.weeks) {
      const b = before[w.week], a = weekTotal(w);
      if (b > 0 && a > b * 1.2) { ok = reject(`week ${w.week} ${b}->${a} exceeds +20%`); break; }
    }
    if (ok) {
      // CTL ramp check from today's actual CTL across the remaining plan
      const todayW = [...wellness].reverse().find((w) => w.ctl != null);
      let ctl = todayW.ctl;
      if (todayW.id !== today) for (let d = addDays(todayW.id, 1); d <= today; d = addDays(d, 1)) ctl += (loadOn(next, d) - ctl) / 42;
      const ctlAt = { [today]: ctl };
      for (let d = addDays(today, 1); d <= last; d = addDays(d, 1)) { ctl += (loadOn(next, d) - ctl) / 42; ctlAt[d] = ctl; }
      const actual = Object.fromEntries(wellness.map((w) => [w.id, w.ctl]));
      for (const w of next.weeks) {
        const end = addDays(w.start, 6), pre = addDays(w.start, -1);
        if (end <= today || w.start > last) continue;
        if (plan.race.date >= w.start && plan.race.date <= end) continue;
        const startCtl = actual[pre] ?? ctlAt[pre];
        if (startCtl != null && ctlAt[end] - startCtl > 6.0) { ok = reject(`week ${w.week} CTL ramp ${(ctlAt[end] - startCtl).toFixed(1)} > 6`); break; }
      }
    }
    if (ok) {
      writeJson("data/current-plan.json", next);
      for (const s of sessions) writeJson(`data/sessions/${s.date}.json`, s);
      for (const d of restDates) fs.rmSync(`data/sessions/${d}.json`, { force: true });
      changelog.push({ date: today, change: String(out.changelog.change), reason: String(out.changelog.reason), affects: [...new Set(dates)].sort() });
      writeJson("data/changelog.json", changelog);
      applied = true;
    }
  }

  writeJson("data/briefing.json", {
    date: today, generatedAt: new Date().toISOString(),
    headline: String(out.briefing.headline).trim(), summary: String(out.briefing.summary).trim(),
    flags, suggestedChange: applied ? (out.briefing.suggestedChange || out.changelog.change) : null,
  });
  fs.writeFileSync(process.env.GITHUB_OUTPUT || "/dev/null", `applied=${applied}\n`, { flag: "a" });
  console.log(applied ? "Plan edits applied" : "Briefing only", "|", out.briefing.headline);
}

main().catch((e) => { console.error(e); process.exit(1); });
