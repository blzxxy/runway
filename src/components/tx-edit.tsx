"use client";

import { useState } from "react";
import { Package, X } from "lucide-react";
import { fmt } from "@/lib/finance";
import type { Flip, Tx } from "@/lib/types";

const EXPENSE_CATS = ["Gas", "Eating out", "Car", "School", "Flip buy", "Other"];
const INCOME_CATS = ["Paycheck", "Preaching", "Flip sale", "Other"];

/** Bottom sheet for editing any transaction (manual or Teller-imported):
 *  recategorize, edit note/date, or link an expense to the flip tracker. */
export default function TxEditSheet({
  tx,
  flips,
  onClose,
  onSave,
  onLinkFlip,
  onDelete,
}: {
  tx: Tx;
  flips: Flip[];
  onClose: () => void;
  onSave: (patch: Partial<Tx>) => Promise<void>;
  onLinkFlip: (flipId: string | "new") => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [category, setCategory] = useState(tx.category ?? "Other");
  const [note, setNote] = useState(tx.note ?? "");
  const [date, setDate] = useState(tx.date);
  const [amount, setAmount] = useState(String(tx.amount));
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [flipChoice, setFlipChoice] = useState<string>("new");

  const cats = tx.type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const canEditCat = tx.type === "income" || tx.type === "expense";
  const linkable = tx.type === "expense";
  const candidates = flips.filter((f) => ["planned", "preordered", "owned", "listed"].includes(f.status));

  const inputCls =
    "w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-zinc-100 outline-none border border-zinc-700 focus:border-zinc-500";

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        category,
        note: note || null,
        date,
        amount: parseFloat(amount) || tx.amount,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-70" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 rounded-t-3xl p-5 safe-bottom" style={{ maxHeight: "92vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Edit transaction</h2>
          <button onClick={onClose} className="p-2 rounded-full bg-zinc-800">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          {tx.source === "teller" ? "Imported from your bank" : "Manually entered"} · {tx.type} ·{" "}
          {fmt(tx.amount, true)}
        </p>

        {canEditCat && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-sm ${
                  category === c ? "bg-zinc-100 text-zinc-900 font-semibold" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="mb-3 flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-zinc-400">Amount</label>
            <div className="flex items-center mt-1 bg-zinc-800 rounded-xl border border-zinc-700 px-3">
              <span className="text-zinc-500 mr-1">$</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                className="w-full bg-transparent py-2.5 outline-none" />
            </div>
          </div>
          <div className="flex-1">
            <label className="text-xs text-zinc-400">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " mt-1"} />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-zinc-400">Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls + " mt-1"} />
        </div>

        {linkable && !linkOpen && (
          <button
            onClick={() => setLinkOpen(true)}
            className="w-full py-2.5 rounded-xl bg-purple-950 text-purple-200 text-sm font-semibold flex items-center justify-center gap-2 mb-3"
          >
            <Package size={14} /> This is flip inventory…
          </button>
        )}

        {linkable && linkOpen && (
          <div className="bg-zinc-800 rounded-xl p-3 mb-3">
            <label className="text-xs text-zinc-400">Link to which flip?</label>
            <select value={flipChoice} onChange={(e) => setFlipChoice(e.target.value)}
              className="w-full mt-1 mb-2 bg-zinc-900 rounded-xl px-3 py-2.5 outline-none border border-zinc-700">
              <option value="new">➕ New flip from this purchase</option>
              {candidates.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onLinkFlip(flipChoice as any);
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full py-2.5 rounded-xl bg-purple-700 text-white text-sm font-bold"
            >
              {busy ? "Linking…" : "Move into flip tracker"}
            </button>
            <p className="text-xs text-zinc-500 mt-2">
              Converts this expense into a Flip Buy and {flipChoice === "new" ? "creates a new flip card" : "attaches it to the flip"}.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (window.confirm("Delete this transaction?")) {
                await onDelete();
                onClose();
              }
            }}
            className="px-4 py-3 rounded-2xl bg-red-950 text-red-300 text-sm font-semibold"
          >
            Delete
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-green-600 text-white font-bold"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
