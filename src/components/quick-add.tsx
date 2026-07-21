"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { addBusinessDays, fmt, sellCalc, todayStr } from "@/lib/finance";
import type { AddPrefill, Flip, SavingsTarget } from "@/lib/types";

export type QuickAddPayload =
  | {
      kind: "tx";
      type: "income" | "expense" | "savings";
      amount: number;
      date: string;
      category: string;
      note: string;
      target?: SavingsTarget;
    }
  | {
      kind: "flip-buy";
      name: string;
      qty: number;
      priceEach: number;
      listPrice: number | null;
      date: string;
      note: string;
    }
  | {
      kind: "flip-sell";
      flipId: string;
      priceEach: number;
      shipping: number;
      date: string;
      expectedPayoutDate: string;
    };

const EXPENSE_CATS = ["Gas", "Eating out", "Car", "School", "Other"];
const INCOME_CATS = ["Paycheck", "Preaching", "Other"];
const TARGETS: { key: SavingsTarget; label: string }[] = [
  { key: "ring", label: "Ring" },
  { key: "emergency", label: "Emergency" },
  { key: "house", label: "House" },
];

function TypeChip({
  active,
  onClick,
  label,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap ${
        active ? activeClass : "bg-zinc-800 text-zinc-400"
      }`}
    >
      {label}
    </button>
  );
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm ${
        active ? "bg-zinc-100 text-zinc-900 font-semibold" : "bg-zinc-800 text-zinc-400"
      }`}
    >
      {label}
    </button>
  );
}

export default function QuickAddSheet({
  flips,
  prefill,
  onClose,
  onSubmit,
}: {
  flips: Flip[];
  prefill: AddPrefill | null;
  onClose: () => void;
  onSubmit: (p: QuickAddPayload) => Promise<void>;
}) {
  const [type, setType] = useState<string>(prefill?.type ?? "expense");
  const [amount, setAmount] = useState(prefill?.amount != null ? String(prefill.amount) : "");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState("Gas");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<SavingsTarget>(prefill?.target ?? "ring");
  const [busy, setBusy] = useState(false);
  // flip buy
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("1");
  const [listPrice, setListPrice] = useState("");
  // flip sell
  const sellable = flips.filter((f) => ["owned", "listed", "preordered"].includes(f.status));
  const [flipId, setFlipId] = useState(prefill?.flipId ?? (sellable[0]?.id ?? ""));
  const flip = flips.find((f) => f.id === flipId);
  const [shipping, setShipping] = useState(String(flip?.shipping ?? 11));
  const [payoutDate, setPayoutDate] = useState(addBusinessDays(todayStr(), 3));

  useEffect(() => {
    if (type === "flip-sell" && flip) {
      if (!amount && flip.list_price) setAmount(String(flip.list_price));
      setShipping(String(flip.shipping ?? 11));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipId, type]);

  useEffect(() => {
    setPayoutDate(addBusinessDays(date, 3));
  }, [date]);

  const amt = parseFloat(amount) || 0;
  const q = Math.max(1, parseInt(qty) || 1);
  const ship = parseFloat(shipping) || 0;
  const calc = flip ? sellCalc(amt, flip.qty, ship) : null;

  const canSave =
    type === "flip-sell" ? amt > 0 && !!flip : type === "flip-buy" ? amt > 0 && !!itemName.trim() : amt > 0;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      if (type === "flip-buy") {
        await onSubmit({
          kind: "flip-buy",
          name: itemName.trim(),
          qty: q,
          priceEach: amt,
          listPrice: parseFloat(listPrice) || null,
          date,
          note,
        });
      } else if (type === "flip-sell" && flip) {
        await onSubmit({
          kind: "flip-sell",
          flipId: flip.id,
          priceEach: amt,
          shipping: ship,
          date,
          expectedPayoutDate: payoutDate,
        });
      } else {
        await onSubmit({
          kind: "tx",
          type: type as "income" | "expense" | "savings",
          amount: amt,
          date,
          category: type === "savings" ? "Savings" : category,
          note,
          target: type === "savings" ? target : undefined,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full bg-zinc-800 rounded-xl px-4 py-3 text-zinc-100 outline-none border border-zinc-700 focus:border-zinc-500";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-70" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="relative w-full max-w-md bg-zinc-900 rounded-t-3xl p-5 overflow-y-auto safe-bottom"
        style={{ maxHeight: "92vh" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Add transaction</h2>
          <button onClick={onClose} className="p-2 rounded-full bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <TypeChip label="Expense" active={type === "expense"} activeClass="bg-rose-600 text-white"
            onClick={() => { setType("expense"); setCategory("Gas"); }} />
          <TypeChip label="Income" active={type === "income"} activeClass="bg-emerald-600 text-white"
            onClick={() => { setType("income"); setCategory("Preaching"); }} />
          <TypeChip label="Flip Buy" active={type === "flip-buy"} activeClass="bg-violet-600 text-white"
            onClick={() => setType("flip-buy")} />
          <TypeChip label="Flip Sell" active={type === "flip-sell"} activeClass="bg-violet-600 text-white"
            onClick={() => { setType("flip-sell"); setAmount(""); }} />
          <TypeChip label="→ Savings" active={type === "savings"} activeClass="bg-sky-600 text-white"
            onClick={() => setType("savings")} />
        </div>

        {type === "flip-sell" && (
          <div className="mb-3">
            <label className="text-xs text-zinc-400">Item</label>
            {sellable.length === 0 ? (
              <p className="text-sm text-zinc-500 mt-1">No owned/listed flips to sell.</p>
            ) : (
              <select value={flipId} onChange={(e) => setFlipId(e.target.value)} className={inputCls + " mt-1"}>
                {sellable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.qty > 1 ? `(x${f.qty})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {type === "flip-buy" && (
          <div className="mb-3 flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-zinc-400">Item name</label>
              <input value={itemName} onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Prismatic SPC" className={inputCls + " mt-1"} />
            </div>
            <div className="w-20">
              <label className="text-xs text-zinc-400">Qty</label>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric"
                className={inputCls + " mt-1"} />
            </div>
          </div>
        )}

        <div className="mb-3">
          <label className="text-xs text-zinc-400">
            {type === "flip-sell" ? "Sale price (each)" : type === "flip-buy" ? "Buy price (each)" : "Amount"}
          </label>
          <div className="flex items-center mt-1 bg-zinc-800 rounded-xl border border-zinc-700 focus-within:border-zinc-500 px-4">
            <span className="text-2xl text-zinc-500 mr-1">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              autoFocus
              className="w-full bg-transparent py-3 text-3xl font-bold outline-none"
            />
          </div>
        </div>

        {type === "flip-buy" && (
          <div className="mb-3">
            <label className="text-xs text-zinc-400">Target sell price (each, optional)</label>
            <input value={listPrice} onChange={(e) => setListPrice(e.target.value)} inputMode="decimal"
              placeholder="0" className={inputCls + " mt-1"} />
          </div>
        )}

        {type === "flip-sell" && flip && (
          <div className="mb-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-zinc-400">Shipping (each)</label>
                <input value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal"
                  className={inputCls + " mt-1"} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-400">Expected payout</label>
                <input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)}
                  className={inputCls + " mt-1"} />
              </div>
            </div>
            {amt > 0 && calc && (
              <div className="mt-3 bg-zinc-800 rounded-xl p-3 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Gross ({flip.qty}x)</span><span>{fmt(calc.gross, true)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>eBay fees (13.25% + $0.30)</span><span>-{fmt(calc.fees, true)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Shipping</span><span>-{fmt(calc.ship, true)}</span>
                </div>
                <div className="flex justify-between font-bold text-zinc-100 border-t border-zinc-700 mt-2 pt-2">
                  <span>Payout (pending)</span><span className="text-violet-300">{fmt(calc.payout, true)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-zinc-400">Profit vs cost ({fmt(flip.buy_price * flip.qty)})</span>
                  <span className={calc.payout - flip.buy_price * flip.qty >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {fmt(calc.payout - flip.buy_price * flip.qty, true)}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Cash won't move yet — the money shows under "Pending payouts" until you mark it paid out.
                </p>
              </div>
            )}
          </div>
        )}

        {type === "expense" && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {EXPENSE_CATS.map((c) => (
              <CatChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
            ))}
          </div>
        )}
        {type === "income" && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {INCOME_CATS.map((c) => (
              <CatChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
            ))}
          </div>
        )}
        {type === "savings" && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {TARGETS.map((t) => (
              <CatChip key={t.key} label={t.label} active={target === t.key} onClick={() => setTarget(t.key)} />
            ))}
          </div>
        )}

        <div className="mb-3 flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-zinc-400">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={inputCls + " mt-1"} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-zinc-400">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
              className={inputCls + " mt-1"} />
          </div>
        </div>

        <button
          onClick={save}
          disabled={!canSave || busy}
          className={`w-full py-4 rounded-2xl text-lg font-bold mt-2 ${
            canSave && !busy ? "bg-emerald-600 text-white active:bg-emerald-700" : "bg-zinc-800 text-zinc-600"
          }`}
        >
          {busy
            ? "Saving…"
            : type === "flip-sell" && calc && amt > 0
            ? `Confirm sale — ${fmt(calc.payout, true)} pending`
            : "Save"}
        </button>
      </motion.div>
    </div>
  );
}
