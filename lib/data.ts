import fs from "node:fs";
import path from "node:path";
import { ChangelogSchema, PlanSchema, SessionSchema, type Changelog, type Plan, type Session } from "./schemas";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

export function loadOriginalPlan(): Plan {
  return PlanSchema.parse(readJson("plan.json"));
}

export function loadCurrentPlan(): Plan {
  return PlanSchema.parse(readJson("current-plan.json"));
}

export function loadChangelog(): Changelog {
  return ChangelogSchema.parse(readJson("changelog.json"));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function loadSession(date: string): Session | null {
  if (!ISO_DATE.test(date)) throw new Error(`invalid session date: ${date}`);
  const file = path.join(DATA_DIR, "sessions", `${date}.json`);
  if (!fs.existsSync(file)) return null;
  return SessionSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function listSessionDates(): string[] {
  const dir = path.join(DATA_DIR, "sessions");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}
