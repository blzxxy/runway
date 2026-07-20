"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock, Gem, Shield, Trash2, Wallet, X } from "lucide-react";
import { useFinance } from "./finance-provider";
import { daysUntil, fmt, fmtDate, todayStr } from "@/lib/finance";

export function Bar({
  pct,
  colorClass,
  markers,
}: {
  pct: number;
  colorClass: string;
  markers?: number[];
}) {
  return (
    <div className="relative h-3 w-full rounded-full bg-zinc-800">
      <div
        className={`bar-fill h-3 rounded-full ${colorClass}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
      {(markers ?? []).map((m, i) => (
        <div key={i} className="absolute top-0 h-3 w-0.5 bg-zinc-500" style={{ left: `${m}%` }} />
      ))}
    </div>
  );
}

export function CashCard() {
  const { derived, profile } = useFinance();
  const { cash, nextPay, schoolPaid, schoolItem } = derived;
  const schoolDays = profile.school_due_date ? daysUntil(profile.school_due_date) : null;
  const schoolBal = schoolItem?.balAfter ?? null;
  const schoolColor = schoolPaid
    ? "bg-green-900 text-green-300"
    : schoolBal == null || schoolBal >= 100
    ? "bg-green-900 text-green-300"
    : schoolBal >= 0
    ? "bg-yellow-900 text-yellow-300"
    : "bg-red-900 text-red-300";

  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="flex items-center gap-2 text-zinc-400 text-sm">
        <Wallet size={16} /> Current cash
      </div>
      <div className={`text-5xl font-extrabold mt-1 ${cash >= 0 ? "text-zinc-50" : "text-red-400"}`}>
        {fmt(cash)}
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">
        {nextPay && (
          <span className="px-3 py-1.5 rounded-full bg-green-900 text-green-300 text-sm font-semibold">
            Payday in {daysUntil(nextPay.date)}d · {fmtDate(nextPay.date)} +{fmt(nextPay.amount)}
          </span>
        )}
        {profile.school_due_date && (
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${schoolColor}`}>
            {schoolPaid
              ? "School paid ✓"
              : `School ${fmt(profile.school_amount ?? 0)} in ${schoolDays}d${
                  schoolBal != null ? ` · proj ${fmt(schoolBal)} after` : ""
                }`}
          </span>
        )}
      </div>
    </div>
  );
}

export function DiamondBanner() {
  const { derived, profile, ringPurchase } = useFinance();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(profile.ring_diamond_cost));
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (derived.diamondPurchased || derived.ringRaised < profile.ring_diamond_cost) return null;

  const confirm = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || busy) return;
    setBusy(true);
    await ringPurchase({ amount: amt, date, note });
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      <div className="bg-amber-900 border border-amber-600 rounded-3xl p-4 flex items-center justify-between gap-3">
        <div className="text-sm text-amber-100">
          <span className="font-bold">💎 Diamond funded!</span> Time to buy the loose stone before
          prices shift.
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 px-3 py-2 rounded-xl bg-amber-500 text-zinc-950 text-sm font-bold"
        >
          Mark purchased
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black bg-opacity-70" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-amber-800 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2">
                <Gem size={16} className="text-amber-400" /> Log diamond purchase
              </h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full bg-zinc-800">
                <X size={16} />
              </button>
            </div>
            <label className="text-xs text-zinc-400">Amount spent</label>
            <div className="flex items-center mt-1 mb-3 bg-zinc-800 rounded-xl border border-zinc-700 px-3">
              <span className="text-zinc-500 mr-1">$</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                className="w-full bg-transparent py-2.5 font-bold outline-none" />
            </div>
            <label className="text-xs text-zinc-400">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 mb-3 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700 outline-none" />
            <label className="text-xs text-zinc-400">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="2.5ct lab-grown, seller…"
              className="w-full mt-1 mb-4 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700 outline-none" />
            <button
              onClick={confirm}
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-amber-500 text-zinc-950 font-bold"
            >
              {busy ? "Saving…" : "Confirm — money comes out of the ring fund"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function PendingPayoutsCard() {
  const { derived, payoutFlip } = useFinance();
  if (derived.pendingFlips.length === 0) return null;
  return (
    <div className="bg-zinc-900 border border-purple-900 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-purple-300 text-sm font-semibold">
          <Clock size={16} /> Pending payouts
        </div>
        <span className="font-bold text-purple-200">
          {fmt(derived.pendingPayoutTotal, true)} · {derived.pendingFlips.length}{" "}
          {derived.pendingFlips.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {derived.pendingFlips.map((f) => (
          <div key={f.id} className="flex items-center justify-between text-sm">
            <div className="min-w-0">
              <div className="truncate">{f.name}</div>
              <div className="text-xs text-zinc-500">
                expected {f.expected_payout_date ? fmtDate(f.expected_payout_date) : "soon"}
              </div>
            </div>
            <div className="flex items-center gap-2 pl-2">
              <span className="font-semibold text-purple-300">{fmt(f.payout ?? 0, true)}</span>
              <button
                onClick={() => payoutFlip(f.id)}
                className="px-2.5 py-1.5 rounded-lg bg-purple-800 text-purple-100 text-xs font-semibold"
              >
                Paid out
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RingCard() {
  const { derived, profile } = useFinance();
  const total = profile.ring_diamond_cost + profile.ring_setting_cost;
  const diamondPct = (profile.ring_diamond_cost / total) * 100;
  const pct = (derived.ringRaised / total) * 100;
  return (
    <div className="bg-zinc-900 rounded-3xl p-5 border border-amber-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
          <Gem size={16} /> Ring fund
        </div>
        <span className="text-sm text-zinc-400">
          <b className="text-amber-300 text-lg">{fmt(derived.ringRaised)}</b> / {fmt(total)}
        </span>
      </div>
      <div className="mt-3">
        <Bar pct={pct} colorClass="bg-amber-500" markers={[diamondPct]} />
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>$0</span>
          <span className={derived.ringRaised >= profile.ring_diamond_cost ? "text-amber-400 font-semibold" : ""}>
            {derived.diamondPurchased ? "💎 stone purchased ✓" : `${fmt(profile.ring_diamond_cost)} diamond`}
          </span>
          <span>{fmt(total)}</span>
        </div>
      </div>
      {derived.diamondPurchased && (
        <p className="text-xs text-amber-300 mt-2">
          Setting: {fmt(Math.max(0, derived.ringBalance))} of {fmt(profile.ring_setting_cost)}
        </p>
      )}
    </div>
  );
}

export function EmergencyCard() {
  const { derived, profile } = useFinance();
  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold">
          <Shield size={16} /> Emergency buffer
        </div>
        <span className="text-sm text-zinc-400">
          <b className="text-blue-300 text-lg">{fmt(derived.savings.emergency)}</b> /{" "}
          {fmt(profile.emergency_target)}
        </span>
      </div>
      <div className="mt-3">
        <Bar pct={(derived.savings.emergency / profile.emergency_target) * 100} colorClass="bg-blue-500" />
      </div>
      {derived.savings.house > 0 && (
        <p className="text-xs text-zinc-500 mt-2">House fund: {fmt(derived.savings.house)}</p>
      )}
    </div>
  );
}

export function WeeklyCard() {
  const { derived, profile } = useFinance();
  const { weekSpent, pace } = derived;
  const budget = profile.weekly_budget;
  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">This week · gas + eating out</span>
        <span className="text-sm">
          <b className={`text-lg ${weekSpent > budget ? "text-red-400" : "text-zinc-100"}`}>
            {fmt(weekSpent)}
          </b>
          <span className="text-zinc-500"> / {fmt(budget)}</span>
        </span>
      </div>
      <div className="mt-3">
        <Bar
          pct={(weekSpent / budget) * 100}
          colorClass={weekSpent > budget ? "bg-red-500" : pace > budget ? "bg-yellow-500" : "bg-green-500"}
        />
      </div>
      {weekSpent > budget ? (
        <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
          <AlertTriangle size={12} /> Over budget by {fmt(weekSpent - budget)}
        </p>
      ) : pace > budget ? (
        <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
          <AlertTriangle size={12} /> On pace for {fmt(Math.round(pace))} by Sunday
        </p>
      ) : (
        <p className="text-xs text-zinc-500 mt-2">{fmt(budget - weekSpent)} left this week</p>
      )}
    </div>
  );
}

export function AllocatorCard() {
  const { derived, profile, openAdd } = useFinance();
  const unlocked =
    derived.schoolPaid ||
    !profile.school_due_date ||
    daysUntil(profile.school_due_date) < 0;
  const total = profile.alloc_ring + profile.alloc_emergency + profile.alloc_flex;

  return (
    <div className={`bg-zinc-900 rounded-3xl p-5 ${unlocked ? "" : "opacity-60"}`}>
      <div className="text-sm font-semibold text-zinc-300">
        Paycheck allocator{unlocked ? "" : " · unlocks after school is paid"}
      </div>
      {unlocked && (
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-amber-300">Ring fund</span>
            <span>{fmt(profile.alloc_ring)}/mo</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-300">
              Emergency{derived.savings.emergency >= profile.emergency_target ? " (full ✓)" : ""}
            </span>
            <span>{fmt(profile.alloc_emergency)}/mo</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-300">Flex / resale capital</span>
            <span>{fmt(profile.alloc_flex)}/mo</span>
          </div>
          <p className="text-xs text-zinc-500 pt-1">
            {fmt(total)}/mo ≈ {fmt(Math.round(total / 4))} per paycheck (4 checks/mo). Edit the split
            in Settings.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() =>
                openAdd({ type: "savings", target: "ring", amount: Math.round(profile.alloc_ring / 4) })
              }
              className="flex-1 py-2 rounded-xl bg-amber-900 text-amber-200 text-sm font-semibold"
            >
              + Ring {fmt(Math.round(profile.alloc_ring / 4))}
            </button>
            <button
              onClick={() =>
                openAdd({
                  type: "savings",
                  target: "emergency",
                  amount: Math.round(profile.alloc_emergency / 4),
                })
              }
              className="flex-1 py-2 rounded-xl bg-blue-900 text-blue-200 text-sm font-semibold"
            >
              + Buffer {fmt(Math.round(profile.alloc_emergency / 4))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecentList() {
  const { txs, deleteTx } = useFinance();
  const recent = txs.slice(0, 8);
  const label = (t: (typeof txs)[number]) => {
    if (t.type === "savings") return `→ ${t.target === "ring" ? "Ring" : t.target === "emergency" ? "Emergency" : "House"}`;
    if (t.type === "ring-purchase") return `💎 ${t.note || "Diamond purchase"}`;
    return t.note || t.category || t.type;
  };
  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="text-sm font-semibold text-zinc-300 mb-2">Recent</div>
      {recent.length === 0 ? (
        <p className="text-sm text-zinc-500">No transactions yet. Hit the big + button.</p>
      ) : (
        <div className="divide-y divide-zinc-800">
          {recent.map((t) => {
            const out = t.type === "expense" || t.type === "flip-buy" || t.type === "savings";
            const color =
              t.type === "savings"
                ? "text-blue-400"
                : t.type === "ring-purchase"
                ? "text-amber-400"
                : out
                ? "text-red-400"
                : "text-green-400";
            return (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{label(t)}</div>
                  <div className="text-xs text-zinc-500">
                    {fmtDate(t.date)} · {t.category ?? t.type}
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-2">
                  <span className={`font-bold ${color}`}>
                    {t.type === "ring-purchase" ? "-" : out ? "-" : "+"}
                    {fmt(t.amount, true)}
                  </span>
                  <button onClick={() => deleteTx(t.id)} className="p-1.5 text-zinc-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
