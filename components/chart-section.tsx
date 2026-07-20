"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CtlChartPoint = { date: string; plan?: number; actual?: number; projected?: number };
export type DplusChartPoint = { week: string; planned: number; actual: number | null };

const TOOLTIP_STYLE = {
  background: "var(--surface-2)",
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--ink)",
};

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)]}`;
}

function LegendSwatch({ color, dash, label }: { color: string; dash?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
      <svg width="20" height="6" aria-hidden>
        <line x1="0" y1="3" x2="20" y2="3" stroke={color} strokeWidth="2.5" strokeDasharray={dash} />
      </svg>
      {label}
    </span>
  );
}

function CtlChart({ data, raceDate }: { data: CtlChartPoint[]; raceDate: string }) {
  const ticks = data.filter((_, i) => i % 14 === 0).map((p) => p.date);
  return (
    <>
      <div className="flex gap-4 flex-wrap mb-2">
        <LegendSwatch color="var(--muted)" dash="6 4" label="Original plan" />
        <LegendSwatch color="var(--accent)" label="Actual" />
        <LegendSwatch color="var(--projected)" dash="2 4" label="Projected" />
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={shortDate}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--grid)" }}
            tickLine={false}
          />
          <YAxis
            domain={[20, 50]}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(value, name) => [Number(value).toFixed(1), String(name)]}
          />
          <ReferenceArea y1={40} y2={44} fill="var(--accent)" fillOpacity={0.08} />
          <ReferenceLine x={raceDate} stroke="var(--ink-2)" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="plan" name="Original plan" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--accent)" strokeWidth={3} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="projected" name="Projected" stroke="var(--projected)" strokeWidth={2} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function DplusChart({ data }: { data: DplusChartPoint[] }) {
  return (
    <>
      <div className="flex gap-4 flex-wrap mb-2">
        <LegendSwatch color="var(--muted)" label="Planned (weekend)" />
        <LegendSwatch color="var(--accent)" label="Actual (weekend)" />
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="week" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={{ stroke: "var(--grid)" }} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="planned" name="Planned" fill="var(--muted)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="actual" name="Actual" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export function ChartSection({
  ctlData,
  dplusData,
  raceDate,
}: {
  ctlData: CtlChartPoint[];
  dplusData: DplusChartPoint[];
  raceDate: string;
}) {
  const [view, setView] = useState<"ctl" | "dplus">("ctl");
  return (
    <section className="rounded-2xl bg-surface border border-[var(--hairline)] p-4">
      <div className="flex rounded-lg bg-surface-2 p-0.5 mb-3 text-[13px] font-medium">
        <button
          onClick={() => setView("ctl")}
          className={`flex-1 rounded-md py-1.5 ${view === "ctl" ? "bg-surface text-ink" : "text-muted"}`}
        >
          CTL trajectory
        </button>
        <button
          onClick={() => setView("dplus")}
          className={`flex-1 rounded-md py-1.5 ${view === "dplus" ? "bg-surface text-ink" : "text-muted"}`}
        >
          Weekend D+
        </button>
      </div>
      {view === "ctl" ? <CtlChart data={ctlData} raceDate={raceDate} /> : <DplusChart data={dplusData} />}
    </section>
  );
}
