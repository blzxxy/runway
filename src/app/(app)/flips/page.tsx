"use client";

import { X } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { breakEvenPrice, fmt, fmtDate, sellCalc } from "@/lib/finance";
import type { Flip, FlipStatus } from "@/lib/types";

const STATUS_STYLE: Record<FlipStatus, string> = {
  planned: "bg-zinc-700 text-zinc-300",
  preordered: "bg-cyan-900 text-cyan-300",
  owned: "bg-sky-900 text-sky-300",
  listed: "bg-amber-900 text-amber-300",
  sold: "bg-violet-900 text-violet-300",
  paid_out: "bg-emerald-800 text-emerald-200",
};

const STATUS_LABEL: Record<FlipStatus, string> = {
  planned: "planned",
  preordered: "preordered",
  owned: "owned",
  listed: "listed",
  sold: "sold · $ pending",
  paid_out: "paid out",
};

const CYCLE: FlipStatus[] = ["planned", "preordered", "owned", "listed"];

export default function FlipsPage() {
  const { flips, derived, updateFlip, deleteFlip, payoutFlip, openAdd, today } = useFinance();

  const cycle = (f: Flip) => {
    const i = CYCLE.indexOf(f.status);
    if (i >= 0) {
      const next = CYCLE[(i + 1) % CYCLE.length];
      updateFlip(f.id, { status: next, listed_at: next === "listed" ? today : f.listed_at });
    }
  };

  return (
    <div className="space-y-3 page-in">
      <h1 className="text-xl font-extrabold tracking-tight mb-1">Flips</h1>

      <div className="card-glass rounded-2xl p-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-zinc-500">Invested</div>
          <div className="font-bold text-lg money">{fmt(derived.flipsInvested)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Profit</div>
          <div
            className={`font-bold text-lg money ${
              derived.flipsProfit >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {fmt(derived.flipsProfit, true)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">ROI</div>
          <div className="font-bold text-lg text-violet-300 money">
            {derived.flipsInvested > 0
              ? Math.round((derived.flipsProfit / derived.flipsInvested) * 100) + "%"
              : "—"}
          </div>
        </div>
      </div>

      {flips.map((f) => {
        const cost = f.buy_price * f.qty;
        const est = f.list_price ? sellCalc(f.list_price, f.qty, f.shipping ?? 11) : null;
        const profit = f.payout != null && (f.status === "sold" || f.status === "paid_out")
          ? f.payout - cost
          : null;
        return (
          <div key={f.id} className="card-glass rounded-2xl p-4 shadow-[0_0_30px_rgba(167,139,250,0.08)]">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm truncate pr-2">
                {f.name} {f.qty > 1 && <span className="text-zinc-500">×{f.qty}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => cycle(f)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[f.status]}`}
                >
                  {STATUS_LABEL[f.status]}
                </button>
                <button onClick={() => deleteFlip(f.id)} className="p-1 text-zinc-600">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div>
                <div className="text-xs text-zinc-500">Cost</div>
                <div className="text-sm font-bold">{cost > 0 ? fmt(cost) : "TBD"}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{f.sold_price ? "Sold @" : "Target"}</div>
                <div className="text-sm font-bold">
                  {f.sold_price ? fmt(f.sold_price) : f.list_price ? fmt(f.list_price) : "TBD"}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">
                  {profit != null ? "Net profit" : "Est. profit"}
                </div>
                <div
                  className={`text-sm font-bold ${
                    profit != null
                      ? profit >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                      : est
                      ? "text-zinc-300"
                      : "text-zinc-600"
                  }`}
                >
                  {profit != null ? fmt(profit, true) : est ? "~" + fmt(est.payout - cost) : "—"}
                </div>
              </div>
            </div>

            {f.status === "sold" && (
              <div className="mt-3 bg-violet-950 rounded-xl p-3 flex items-center justify-between">
                <div className="text-xs text-violet-200">
                  Payout {fmt(f.payout ?? 0, true)} pending
                  {f.expected_payout_date ? ` · expected ${fmtDate(f.expected_payout_date)}` : ""}
                </div>
                <button
                  onClick={() => payoutFlip(f.id)}
                  className="px-3 py-1.5 rounded-lg bg-violet-700 text-white text-xs font-bold"
                >
                  Mark paid out
                </button>
              </div>
            )}

            {["planned", "preordered", "owned", "listed"].includes(f.status) && cost > 0 && (
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Break-even: <b className="text-zinc-300">{fmt(breakEvenPrice(cost, f.qty, f.shipping ?? 11), true)}</b> each
                after fees + shipping — don't accept offers below that.
              </p>
            )}

            {f.note && <div className="text-xs text-zinc-500 mt-2">{f.note}</div>}

            {["owned", "listed", "preordered"].includes(f.status) && (
              <button
                onClick={() => openAdd({ type: "flip-sell", flipId: f.id })}
                className="w-full mt-3 py-2 rounded-xl bg-violet-800 text-violet-100 text-sm font-semibold"
              >
                Sell this
              </button>
            )}
          </div>
        );
      })}

      <p className="text-xs text-zinc-600 px-2 pb-2">
        Status flow: planned → preordered → owned → listed → sold ($ pending) → paid out ($ in
        cash). Tap a status badge to cycle the first four. Selling deducts eBay fees (13.25% +
        $0.30/item) and shipping automatically; cash moves only when you mark the payout received.
      </p>
    </div>
  );
}
