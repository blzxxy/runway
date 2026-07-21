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

type Mode = "checking" | "checking+savings" | "cash+ring";

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  const v = p.actual ?? p.projected;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-xs" style={{ maxWidth: 230 }}>
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
  const { chart, profile, derived, checkingCash, savingsCash, banks } = useFinance();
  const [selected, setSelected] = useState<ChartPoint | null>(null);
  const [mode, setMode] = useState<Mode>("checking");

  // Shift the whole series so "today" anchors on the chosen balance.
  const offset =
    mode === "checking"
      ? checkingCash != null
        ? checkingCash - derived.cash
        : 0
      : mode === "checking+savings"
      ? checkingCash != null
        ? checkingCash + savingsCash - derived.cash
        : 0
      : derived.ringBalance; // cash + ring fund

  const data: ChartPoint[] = chart.map((p) => ({
    ...p,
    actual: p.actual != null ? Math.round((p.actual + offset) * 100) / 100 : null,
    projected: p.projected != null ? Math.round((p.projected + offset) * 100) / 100 : null,
  }));

  const schoolLabel =
    profile.school_due_date && !derived.schoolPaid && chart.some((p) => p.date === profile.school_due_date)
      ? fmtDate(profile.school_due_date)
      : null;

  const chip = (m: Mode, label: string, disabled = false) => (
    <button
      key={m}
      disabled={disabled}
      onClick={() => setMode(m)}
      className={`px-2.5 py-1 rounded-full whitespace-nowrap ${
        mode === m ? "bg-zinc-100 text-zinc-900 font-semibold" : "bg-zinc-800 text-zinc-500"
      } ${disabled ? "opacity-40" : ""}`}
      style={{ fontSize: 11 }}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-zinc-300">Balance · 30d back, 30d ahead</div>
      </div>
      <div className="flex gap-1.5 mb-2 overflow-x-auto">
        {chip("checking", banks.length ? "Checking" : "Cash")}
        {chip("checking+savings", "+ Savings", banks.length === 0)}
        {chip("cash+ring", "+ Ring fund")}
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
            onClick={(e: any) => {
              if (e && e.activePayload && e.activePayload.length) {
                setSelected(e.activePayload[0].payload as ChartPoint);
              }
            }}
          >
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} interval={9} axisLine={false} tickLine={false} />
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
            <Line type="monotone" dataKey="actual" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
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
