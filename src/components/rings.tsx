"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useFinance } from "./finance-provider";
import { fmt } from "@/lib/finance";
import { EmergencyCard, RingCard, WeeklyCard } from "./cards";

const SIZE = 190;
const C = SIZE / 2;

function Ring({
  radius,
  pct,
  color,
  track = "#27272a",
}: {
  radius: number;
  pct: number;
  color: string;
  track?: string;
}) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, pct));
  return (
    <>
      <circle cx={C} cy={C} r={radius} fill="none" stroke={track} strokeWidth={13} />
      <motion.circle
        cx={C}
        cy={C}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={13}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - clamped) }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        transform={`rotate(-90 ${C} ${C})`}
      />
    </>
  );
}

/** Apple-Watch-style concentric rings: ring fund / emergency / weekly budget.
 *  Center shows the current level badge. Tap to expand the linear breakdown. */
export default function RingsCard() {
  const { derived, profile } = useFinance();
  const [open, setOpen] = useState(false);

  const ringTotal = profile.ring_diamond_cost + profile.ring_setting_cost;
  const ringPct = derived.ringRaised / ringTotal;
  const emergencyPct = derived.savings.emergency / profile.emergency_target;
  const weekPct = derived.weekSpent / profile.weekly_budget;
  const weekColor = derived.weekSpent > profile.weekly_budget ? "#fb7185" : "#34d399";

  return (
    <div className="card-glass rounded-3xl p-5">
      <button onClick={() => setOpen(!open)} className="w-full">
        <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Ring radius={80} pct={ringPct} color="#f59e0b" />
            <Ring radius={62} pct={emergencyPct} color="#38bdf8" />
            <Ring radius={44} pct={weekPct} color={weekColor} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-2xl font-extrabold money text-amber-300">Lv {derived.level}</div>
            <div className="text-zinc-500 leading-tight" style={{ fontSize: 10, maxWidth: 70 }}>
              {derived.levelName}
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} /> Ring{" "}
            {Math.round(ringPct * 100)}%
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: "#38bdf8" }} /> Buffer{" "}
            {Math.round(Math.min(1, emergencyPct) * 100)}%
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: weekColor }} /> Week{" "}
            {fmt(derived.weekSpent)}
          </span>
        </div>
        <div className="flex items-center justify-center gap-1 mt-2 text-xs text-zinc-600">
          {open ? "hide" : "show"} breakdown{" "}
          <ChevronDown size={12} className={open ? "rotate-180" : ""} style={{ transition: "transform .2s" }} />
        </div>
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 space-y-4 overflow-hidden"
        >
          <RingCard />
          <EmergencyCard />
          <WeeklyCard />
        </motion.div>
      )}
    </div>
  );
}
