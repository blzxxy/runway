"use client";

import { useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFinance } from "./finance-provider";
import { fmt, fmtDate } from "@/lib/finance";
import type { ChartPoint } from "@/lib/finance";

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  const v = p.actual ?? p.projected;
  return (
    <div
      className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-xs"
      style={{ maxWidth: 230 }}
    >
      <div className="font-bold text-zinc-100">
        {p.label} · {v != null ? fmt(v) : "—"}
        {p.actual == null && <span className="text-zinc-500"> (projected)</span>}
      </div>
      {p.notes.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-zinc-400">
          {p.notes.slice(0, 5).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          {p.notes.length > 5 && <li>+{p.notes.length - 5} more</li>}
        </ul>
      )}
    </div>
  );
}

export default function BalanceChart() {
  const { chart, profile, derived } = useFinance();
  const [selected, setSelected] = useState<ChartPoint | null>(null);

  const schoolLabel =
    profile.school_due_date && !derived.schoolPaid && chart.some((p) => p.date === profile.school_due_date)
      ? fmtDate(profile.school_due_date)
      : null;

  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="text-sm font-semibold text-zinc-300 mb-1">
        Balance · 30 days back, 30 forward
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart
            data={chart}
            margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
            onClick={(e: any) => {
              if (e && e.activePayload && e.activePayload.length) {
                setSelected(e.activePayload[0].payload as ChartPoint);
              }
            }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#71717a" }}
              interval={9}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => "$" + v}
              width={52}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
            <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" />
            {schoolLabel && (
              <ReferenceLine
                x={schoolLabel}
                stroke="#818cf8"
                label={{ value: "School", fill: "#818cf8", fontSize: 10, position: "top" }}
              />
            )}
            <Tooltip content={<ChartTip />} />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="#22c55e"
              strokeOpacity={0.55}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {selected && (
        <div className="mt-2 bg-zinc-800 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold">
              {selected.label} · {fmt(selected.actual ?? selected.projected ?? 0)}
              {selected.actual == null && <span className="text-zinc-500"> projected</span>}
            </span>
            <button onClick={() => setSelected(null)} className="text-zinc-500">
              close
            </button>
          </div>
          {selected.notes.length ? (
            <ul className="mt-1 space-y-0.5 text-zinc-400">
              {selected.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500 mt-1">Nothing logged or scheduled this day.</p>
          )}
        </div>
      )}
    </div>
  );
}
