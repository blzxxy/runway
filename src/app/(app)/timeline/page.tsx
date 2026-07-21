"use client";

import { useState } from "react";
import { Check, Repeat, Undo2 } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { fmt, fmtDate } from "@/lib/finance";

export default function TimelinePage() {
  const { derived, events, markActual, dismissEvent, undoActual, today } = useFinance();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);

  const actuals = events
    .filter((e) => e.status === "actual")
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="space-y-2 page-in">
      <h1 className="text-xl font-extrabold tracking-tight mb-2">Timeline</h1>

      <div className="bg-zinc-900 rounded-2xl p-4 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Lowest projected balance (8 wks)</span>
        <span
          className={`font-bold text-lg ${
            derived.minBal < 0
              ? "text-red-400"
              : derived.minBal < 100
              ? "text-yellow-400"
              : "text-green-400"
          }`}
        >
          {fmt(derived.minBal)}
        </span>
      </div>

      {actuals.length > 0 && (
        <div className="pt-1">
          {actuals.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2 px-4 opacity-50">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <Check size={14} className="text-green-500 shrink-0" />
                <span className="line-through truncate">{e.label}</span>
                <span className="text-xs text-zinc-500 shrink-0">{fmtDate(e.date)}</span>
              </div>
              <button onClick={() => undoActual(e.id)} className="p-1 text-zinc-500">
                <Undo2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {derived.items.map((it) => {
        const isStored = !it.dynamic;
        const isOpen = expanded === it.id;
        return (
          <div
            key={it.id}
            className={`bg-zinc-900 rounded-2xl px-4 py-3 ${it.dynamic ? "opacity-70" : ""}`}
          >
            <div
              className="flex items-center justify-between"
              onClick={() => {
                if (isStored) {
                  setExpanded(isOpen ? null : it.id);
                  setAmt(String(Math.abs(it.amount)));
                }
              }}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {it.label}
                  {it.recurring && <Repeat size={12} className="text-zinc-500 shrink-0" />}
                </div>
                <div className="text-xs text-zinc-500">
                  {fmtDate(it.date)}
                  {it.date < today ? " · overdue" : ""}
                </div>
              </div>
              <div className="text-right pl-2">
                <div className={`font-bold ${it.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {it.amount >= 0 ? "+" : ""}
                  {fmt(it.amount)}
                </div>
                <div
                  className={`text-xs ${
                    it.balAfter < 0 ? "text-red-400 font-bold" : "text-zinc-500"
                  }`}
                >
                  bal {fmt(it.balAfter)}
                </div>
              </div>
            </div>
            {isOpen && (
              <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2">
                <div className="flex items-center bg-zinc-800 rounded-lg px-2 flex-1">
                  <span className="text-zinc-500">$</span>
                  <input
                    value={amt}
                    onChange={(e) => setAmt(e.target.value)}
                    inputMode="decimal"
                    className="w-full bg-transparent py-2 px-1 text-sm outline-none"
                  />
                </div>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await markActual(it.id, parseFloat(amt));
                    setBusy(false);
                    setExpanded(null);
                  }}
                  className="px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold flex items-center gap-1"
                >
                  <Check size={14} /> Actual
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await dismissEvent(it.id);
                    setBusy(false);
                    setExpanded(null);
                  }}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm"
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-xs text-zinc-600 px-2 pb-2">
        Tap an event to log it as actual (edit the amount if it differed) or skip it. Recurring
        events (↻) auto-extend — the next occurrence appears when one is completed. Weekly gas/food
        estimates shrink by what you've already spent this week.
      </p>
    </div>
  );
}
