import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

export const PlannedDailyLoadSchema = z.object({
  mon: z.number().int().min(0),
  tue: z.number().int().min(0),
  wed: z.number().int().min(0),
  thu: z.number().int().min(0),
  fri: z.number().int().min(0),
  sat: z.number().int().min(0),
  sun: z.number().int().min(0),
});

export const PlanWeekSchema = z.object({
  week: z.number().int().min(1),
  start: isoDate,
  block: z.string().min(1),
  runKm: z.number().min(0),
  weekendDplus: z.number().min(0),
  plannedDailyLoad: PlannedDailyLoadSchema,
});

export const PlanSchema = z.object({
  race: z.object({
    name: z.string().min(1),
    date: isoDate,
    distanceKm: z.number().positive(),
    dPlus: z.number().positive(),
  }),
  baseline: z.object({ date: isoDate, ctl: z.number(), atl: z.number() }),
  targetRaceCtl: z.number().positive(),
  weeks: z.array(PlanWeekSchema).min(1),
});

const durationString = z
  .string()
  .regex(/^(\d+h)?(\d+m)?(\d+s)?$/, 'duration like "20s", "2m", "1h40m"')
  .refine((s) => s.length > 0, "duration required");

export type SessionStep =
  | {
      kind: "warmup" | "work" | "recover" | "cooldown";
      duration: string;
      target?: string;
      note?: string;
    }
  | { kind: "repeat"; count: number; steps: SessionStep[]; note?: string };

export const SessionStepSchema: z.ZodType<SessionStep> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.enum(["warmup", "work", "recover", "cooldown"]),
      duration: durationString,
      target: z.string().optional(),
      note: z.string().optional(),
    }),
    z.object({
      kind: z.literal("repeat"),
      count: z.number().int().min(1),
      steps: z.array(SessionStepSchema).min(1),
      note: z.string().optional(),
    }),
  ])
);

export const SessionSchema = z.object({
  date: isoDate,
  type: z.enum(["recovery", "easy", "quality", "long", "race"]),
  title: z.string().min(1),
  terrain: z.string().optional(),
  estimatedLoad: z.number().min(0),
  steps: z.array(SessionStepSchema).min(1),
  coachNotes: z.string().optional(),
  icuWorkoutText: z.string().min(1),
});

export const ChangelogSchema = z.array(
  z.object({
    date: isoDate,
    change: z.string().min(1),
    reason: z.string().min(1),
    affects: z.array(isoDate).min(1),
  })
);

export type Plan = z.infer<typeof PlanSchema>;
export type PlanWeek = z.infer<typeof PlanWeekSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Changelog = z.infer<typeof ChangelogSchema>;
