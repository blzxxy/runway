"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Fuel, Gauge, Gem, Landmark, RefreshCw, Shield, Undo2, UtensilsCrossed, Wallet, X } from "lucide-react";
import { useFinance } from "./finance-provider";
import { addDays, daysUntil, fmt, fmtDate, todayStr } from "@/lib/finance";

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
  const { derived, profile, checkingCash, savingsCash, lastSyncedAt, syncing, syncNow, updateProfile } = useFinance();
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

  const bankVerified = checkingCash != null;
  const headline = bankVerified ? checkingCash : cash;
  const mismatch = bankVerified ? Math.round((checkingCash - cash) * 100) / 100 : 0;
  const hasMismatch = bankVerified && Math.abs(mismatch) > 10;
  const syncedAgo = lastSyncedAt
    ? Math.max(0, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 3600000))
    : null;

  return (
    <div className="bg-zinc-900 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Wallet size={16} /> Current cash
        </div>
        {bankVerified && (
          <button
            onClick={() => syncNow()}
            className="flex items-center gap-1 text-xs text-green-500"
          >
            <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
            {syncing ? "syncing…" : `bank verified · ${syncedAgo != null ? (syncedAgo === 0 ? "just now" : `${syncedAgo}h ago`) : "—"}`}
          </button>
        )}
      </div>
      <div className={`text-5xl font-extrabold mt-1 ${headline >= 0 ? "text-zinc-50" : "text-red-400"}`}>
        {fmt(headline)}
      </div>
      {bankVerified && savingsCash > 0 && (
        <p className="text-xs text-zinc-500 mt-1">
          <Landmark size={10} className="inline mr-1" />
          Savings account: {fmt(savingsCash)}
        </p>
      )}

      {hasMismatch && (
        <div className="mt-3 bg-yellow-950 border border-yellow-800 rounded-xl p-3 text-xs text-yellow-200">
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <div>
              Bank shows {fmt(checkingCash)} but the app's running total is {fmt(cash)} ({mismatch > 0 ? "+" : ""}
              {fmt(mismatch)} apart). Something wasn't logged, or a bank transaction hasn't imported yet.
            </div>
          </div>
          <button
            onClick={() => updateProfile({ starting_cash: profile.starting_cash + mismatch })}
            className="mt-2 px-3 py-1.5 rounded-lg bg-yellow-800 text-yellow-100 font-semibold"
          >
            Recalibrate running total to match bank
          </button>
        </div>
      )}

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

export function SafeToSpendCard() {
  const { derived } = useFinance();
  const sts = derived.safeToSpend;
  const tone =
    sts > 50
      ? { text: "text-green-400", ring: "border-green-900" }
      : sts > 0
      ? { text: "text-yellow-400", ring: "border-yellow-900" }
      : { text: "text-red-400", ring: "border-red-900" };
  return (
    <div className={`bg-zinc-900 rounded-3xl p-5 border ${tone.ring}`}>
      <div className="flex items-center gap-2 text-zinc-400 text-sm">
        <Gauge size={16} /> Safe to spend today
      </div>
      <div className={`text-4xl font-extrabold mt-1 tabular ${tone.text}`}>{fmt(sts)}</div>
      <p className="text-xs text-zinc-500 mt-1">
        {sts > 0
          ? "Your weekly gas + food budget stays fully reserved (this week and every week ahead), plus every bill and goal transfer for 8 weeks."
          : "Projections dip below $0 — check the Timeline before spending anything extra."}
      </p>
      {derived.anchorGap > 0 && (
        <p className="text-xs text-zinc-600 mt-1">
          Anchored to your bank balance (running total is {fmt(derived.anchorGap)} higher — hit
          Recalibrate on the cash card to sync them).
        </p>
      )}
    </div>
  );
}

export function QuickLogCard() {
  const { quickLog, deleteTx } = useFinance();
  const [last, setLast] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const log = async (label: string, category: string, amount: number) => {
    if (busy) return;
    setBusy(true);
    const id = await quickLog(category, amount);
    setBusy(false);
    if (id) {
      setLast({ id, label: `${label} ${fmt(amount)}` });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLast(null), 6000);
    }
  };

  return (
    <div className="bg-zinc-900 rounded-3xl p-4">
      <div className="flex gap-2">
        <button
          onClick={() => log("Gas", "Gas", 50)}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl bg-zinc-800 active:bg-zinc-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Fuel size={17} className="text-red-400" /> Gas $50
        </button>
        <button
          onClick={() => log("Food", "Eating out", 30)}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl bg-zinc-800 active:bg-zinc-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <UtensilsCrossed size={17} className="text-red-400" /> Food $30
        </button>
      </div>
      {last && (
        <button
          onClick={() => {
            deleteTx(last.id);
            setLast(null);
          }}
          className="w-full mt-2 py-1.5 text-xs text-zinc-400 flex items-center justify-center gap-1"
        >
          <Check size={12} className="text-green-500" /> Logged {last.label} ·{" "}
          <span className="underline flex items-center gap-0.5">
            <Undo2 size={11} /> undo
          </span>
        </button>
      )}
      <p className="text-xs text-zinc-600 mt-2 text-center">
        One tap logs it today. Edit the amount later if it differed — bank import will dedupe by hand
        (delete one) if it also catches it.
      </p>
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
      <RingEta />
    </div>
  );
}

function RingEta() {
  const { derived, profile } = useFinance();
  const total = profile.ring_diamond_cost + profile.ring_setting_cost;
  const allocM = profile.alloc_ring;
  const remainingDiamond = Math.max(0, profile.ring_diamond_cost - derived.ringRaised);
  const remainingTotal = Math.max(0, total - derived.ringRaised);
  if (allocM <= 0 || remainingTotal <= 0) return null;

  // Contributions start once school is out of the way.
  const schoolBlocks =
    profile.school_due_date && !derived.schoolPaid && daysUntil(profile.school_due_date) >= 0;
  const base = schoolBlocks ? (profile.school_due_date as string) : todayStr();

  const etaFor = (remaining: number) => fmtDate(addDays(base, Math.ceil((remaining / allocM) * 30.4)));

  return (
    <p className="text-xs text-zinc-500 mt-2">
      On the {fmt(allocM)}/mo plan{schoolBlocks ? " (starting after school is paid)" : ""}:{" "}
      {!derived.diamondPurchased && remainingDiamond > 0 && (
        <>
          💎 diamond ≈ <b className="text-amber-400">{etaFor(remainingDiamond)}</b> ·{" "}
        </>
      )}
      full ring ≈ <b className="text-amber-400">{etaFor(remainingTotal)}</b>
    </p>
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
  const { txs, openTxEdit } = useFinance();
  const recent = txs.slice(0, 10);
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
            const flagged = (t.note ?? "").includes("⚠");
            return (
              <button
                key={t.id}
                onClick={() => openTxEdit(t)}
                className="w-full flex items-center justify-between py-2.5 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{label(t)}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                    {fmtDate(t.date)} · {t.category ?? t.type}
                    {t.source === "teller" && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400" style={{ fontSize: 10 }}>
                        bank
                      </span>
                    )}
                    {flagged && (
                      <span className="px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-300" style={{ fontSize: 10 }}>
                        review
                      </span>
                    )}
                  </div>
                </div>
                <span className={`font-bold pl-2 ${color}`}>
                  {t.type === "ring-purchase" ? "-" : out ? "-" : "+"}
                  {fmt(t.amount, true)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-zinc-600 mt-2">Tap any transaction to edit, recategorize, or link to a flip.</p>
    </div>
  );
}
