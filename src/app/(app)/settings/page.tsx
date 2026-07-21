"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Download,
  Landmark,
  RefreshCw,
  LogOut,
  Plus,
  Repeat,
  Trash2,
  Upload,
} from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import SimpleFinConnect from "@/components/simplefin-connect";
import { createClient } from "@/lib/supabase/client";
import { fmt, fmtDate, todayStr } from "@/lib/finance";
import {
  getExistingSubscription,
  isIOS,
  isStandalone,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import type { Ev, RecurringRule } from "@/lib/types";

const inputCls =
  "w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-zinc-100 outline-none border border-zinc-700 focus:border-zinc-500";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card-glass rounded-3xl p-5">
      <div className="text-sm font-semibold text-zinc-300 mb-3">{title}</div>
      {children}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-3">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="flex items-center mt-1 bg-zinc-800 rounded-xl border border-zinc-700 px-3">
        <span className="text-zinc-500 mr-1">$</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-full bg-transparent py-2.5 outline-none"
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const fin = useFinance();
  const { profile, events, banks, rules, updateProfile, addRecurring, updateSeries, stopSeries, importV1, deleteAllData, signOut, syncNow, syncing, disconnectEnrollment, addRule, deleteRule } = fin;

  /* ---- profile form state ---- */
  const [startingCash, setStartingCash] = useState(String(profile.starting_cash));
  const [weeklyBudget, setWeeklyBudget] = useState(String(profile.weekly_budget));
  const [allocRing, setAllocRing] = useState(String(profile.alloc_ring));
  const [allocEmergency, setAllocEmergency] = useState(String(profile.alloc_emergency));
  const [allocFlex, setAllocFlex] = useState(String(profile.alloc_flex));
  const [schoolDate, setSchoolDate] = useState(profile.school_due_date ?? "");
  const [schoolAmount, setSchoolAmount] = useState(String(profile.school_amount ?? ""));
  const [diamondCost, setDiamondCost] = useState(String(profile.ring_diamond_cost));
  const [settingCost, setSettingCost] = useState(String(profile.ring_setting_cost));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveProfile = async () => {
    setBusy(true);
    await updateProfile({
      starting_cash: parseFloat(startingCash) || 0,
      weekly_budget: parseFloat(weeklyBudget) || 80,
      alloc_ring: parseFloat(allocRing) || 0,
      alloc_emergency: parseFloat(allocEmergency) || 0,
      alloc_flex: parseFloat(allocFlex) || 0,
      school_due_date: schoolDate || null,
      school_amount: schoolAmount ? parseFloat(schoolAmount) : null,
      ring_diamond_cost: parseFloat(diamondCost) || 600,
      ring_setting_cost: parseFloat(settingCost) || 1400,
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /* ---- notifications ---- */
  const supabase = createClient();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  useEffect(() => {
    getExistingSubscription().then((s) => setPushEnabled(!!s));
  }, []);

  const enablePush = async () => {
    setPushMsg(null);
    try {
      await subscribeToPush(supabase, fin.userId);
      setPushEnabled(true);
      setPushMsg("Notifications enabled on this device.");
    } catch (e: any) {
      setPushMsg(e?.message ?? "Could not enable notifications.");
    }
  };

  const disablePush = async () => {
    await unsubscribeFromPush(supabase);
    setPushEnabled(false);
    setPushMsg("Notifications disabled on this device.");
  };

  const toggles: { key: "notify_payday" | "notify_school" | "notify_budget" | "notify_ring" | "notify_teller"; label: string }[] = [
    { key: "notify_payday", label: "Payday mornings" },
    { key: "notify_school", label: "School payment reminders" },
    { key: "notify_budget", label: "Weekly budget at 90%+" },
    { key: "notify_ring", label: "Ring fund milestone" },
    { key: "notify_teller", label: "Bank sync failures" },
  ];

  /* ---- recurring events ---- */
  const seriesRoots = new Map<string, Ev[]>();
  for (const e of events) {
    if (!e.recurring_rule) continue;
    const root = e.recurring_source_id ?? e.id;
    const arr = seriesRoots.get(root) ?? [];
    arr.push(e);
    seriesRoots.set(root, arr);
  }
  const series = Array.from(seriesRoots.entries()).map(([root, arr]) => {
    const pending = arr.filter((e) => e.status === "pending").sort((a, b) => (a.date < b.date ? -1 : 1));
    const sample = pending[0] ?? arr[0];
    return { root, sample, nextDate: pending[0]?.date ?? null, count: pending.length };
  });

  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newSign, setNewSign] = useState<"income" | "expense">("income");
  const [newRule, setNewRule] = useState<RecurringRule>("biweekly");
  const [newStart, setNewStart] = useState(todayStr());

  const addSeries = async () => {
    const amt = parseFloat(newAmount) || 0;
    if (!newLabel.trim() || amt <= 0) return;
    await addRecurring({
      label: newLabel.trim(),
      amount: newSign === "income" ? amt : -amt,
      category: newSign === "income" ? "Paycheck" : "Other",
      start: newStart,
      rule: newRule,
    });
    setNewLabel("");
    setNewAmount("");
  };

  /* ---- bank + rules state ---- */
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleField, setRuleField] = useState<"merchant" | "amount">("merchant");
  const [ruleCategory, setRuleCategory] = useState("Gas");
  const enrollments = Array.from(new Set(banks.map((b) => b.teller_enrollment_id)));

  /* ---- import ---- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearFirst, setClearFirst] = useState(true);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const onImportFile = async (file: File) => {
    setImportMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json || typeof json !== "object") throw new Error("Not a valid backup file");
      await importV1(json, clearFirst);
      setImportMsg("Import complete ✓");
    } catch (e: any) {
      setImportMsg(`Import failed: ${e?.message ?? "unknown error"}`);
    }
  };

  /* ---- export ---- */
  const exportJSON = () => {
    const blob = new Blob(
      [JSON.stringify({ profile: fin.profile, transactions: fin.txs, flips: fin.flips, events: fin.events }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `runway-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---- danger zone ---- */
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="space-y-4 page-in">
      <h1 className="text-xl font-extrabold tracking-tight">Settings</h1>

      <Card title="Money basics">
        <MoneyField label="Starting cash (baseline)" value={startingCash} onChange={setStartingCash} />
        <p className="text-xs text-yellow-500 -mt-2 mb-3 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Changing this rewrites your baseline — all transaction history stays intact, but every
          balance shifts by the difference.
        </p>
        <MoneyField label="Weekly gas + eating out budget" value={weeklyBudget} onChange={setWeeklyBudget} />
      </Card>

      <Card title="Paycheck allocation (per month)">
        <MoneyField label="Ring fund" value={allocRing} onChange={setAllocRing} />
        <MoneyField label="Emergency buffer" value={allocEmergency} onChange={setAllocEmergency} />
        <MoneyField label="Flex / resale capital" value={allocFlex} onChange={setAllocFlex} />
      </Card>

      <Card title="School payment">
        <div className="mb-3">
          <label className="text-xs text-zinc-400">Due date</label>
          <input type="date" value={schoolDate} onChange={(e) => setSchoolDate(e.target.value)} className={inputCls + " mt-1"} />
        </div>
        <MoneyField label="Amount" value={schoolAmount} onChange={setSchoolAmount} />
      </Card>

      <Card title="Ring goal">
        <MoneyField label="Diamond cost (milestone 1)" value={diamondCost} onChange={setDiamondCost} />
        <MoneyField label="Setting cost (milestone 2)" value={settingCost} onChange={setSettingCost} />
      </Card>

      <button
        onClick={saveProfile}
        disabled={busy}
        className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
      </button>

      <Card title="Recurring events">
        {series.length === 0 && <p className="text-sm text-zinc-500 mb-2">No recurring events.</p>}
        <div className="space-y-3 mb-4">
          {series.map((s) => (
            <div key={s.root} className="bg-zinc-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    <Repeat size={12} className="text-zinc-500" /> {s.sample.label}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {s.sample.recurring_rule} · next {s.nextDate ? fmtDate(s.nextDate) : "—"} ·{" "}
                    {s.count} scheduled
                  </div>
                </div>
                <div className={`font-bold text-sm ${s.sample.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {s.sample.amount >= 0 ? "+" : ""}
                  {fmt(s.sample.amount)}
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={async () => {
                    const v = window.prompt("New amount for all upcoming occurrences:", String(Math.abs(s.sample.amount)));
                    if (v == null) return;
                    const amt = parseFloat(v) || 0;
                    if (amt > 0) await updateSeries(s.root, { amount: s.sample.amount >= 0 ? amt : -amt });
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-zinc-700 text-zinc-200 text-xs font-semibold"
                >
                  Edit amount
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm(`Stop "${s.sample.label}"? All upcoming occurrences will be removed.`))
                      await stopSeries(s.root);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-rose-950 text-rose-300 text-xs font-semibold"
                >
                  Stop recurring
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <div className="text-xs text-zinc-400 mb-2">Add recurring event</div>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (e.g. Phone bill)"
            className={inputCls + " mb-2"} />
          <div className="flex gap-2 mb-2">
            <div className="flex items-center bg-zinc-800 rounded-xl border border-zinc-700 px-3 flex-1">
              <span className="text-zinc-500 mr-1">$</span>
              <input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} inputMode="decimal"
                placeholder="0" className="w-full bg-transparent py-2.5 outline-none" />
            </div>
            <select value={newSign} onChange={(e) => setNewSign(e.target.value as any)} className={inputCls + " flex-1"}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div className="flex gap-2 mb-3">
            <select value={newRule} onChange={(e) => setNewRule(e.target.value as RecurringRule)} className={inputCls + " flex-1"}>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
            <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className={inputCls + " flex-1"} />
          </div>
          <button onClick={addSeries} className="w-full py-2.5 rounded-xl bg-zinc-700 text-zinc-100 text-sm font-semibold flex items-center justify-center gap-1">
            <Plus size={14} /> Add recurring
          </button>
        </div>
      </Card>

      <Card title="Bank connections">
        {banks.length === 0 ? (
          <p className="text-sm text-zinc-500 mb-3">
            No bank linked. Connect via SimpleFIN Bridge ($1.50/mo) to auto-import transactions and show your real balance.
          </p>
        ) : (
          <div className="space-y-2 mb-3">
            {banks.map((b) => (
              <div key={b.id} className="bg-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    <Landmark size={13} className="text-zinc-500" /> {b.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    <button onClick={() => fin.toggleBankType(b.id)} className="underline decoration-dotted">{b.type}</button> · {b.last_balance != null ? fmt(b.last_balance) : "—"} ·{" "}
                    {b.last_synced_at ? "synced " + fmtDate(b.last_synced_at.slice(0, 10)) : "never synced"}
                    {b.needs_reauth && <span className="text-rose-400"> · needs reconnect</span>}
                  </div>
                  {b.last_error && <div className="text-xs text-rose-400 truncate">{b.last_error}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {banks.length > 0 && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={async () => {
                setSyncMsg(null);
                const r = await syncNow();
                setSyncMsg(r ? `Imported ${r.imported} new transaction${r.imported === 1 ? "" : "s"}${r.errors.length ? " · " + r.errors.join("; ") : ""}` : "Sync failed — try again.");
              }}
              disabled={syncing}
              className="flex-1 py-2.5 rounded-xl bg-emerald-800 text-emerald-100 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}
            </button>
            {enrollments.map((en) => (
              <button
                key={en}
                onClick={() => {
                  if (window.confirm("Disconnect this bank? Imported transactions stay; balances stop updating."))
                    disconnectEnrollment(en);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-950 text-rose-300 text-sm font-semibold"
              >
                Disconnect
              </button>
            ))}
          </div>
        )}
        {syncMsg && <p className="text-xs text-zinc-400 mb-3">{syncMsg}</p>}
        <SimpleFinConnect onConnected={() => fin.refresh()} />
        <p className="text-xs text-zinc-600 mt-2">
          Auto-sync runs daily in the background and whenever you open the app after 6+ hours.
        </p>
      </Card>

      <Card title="Categorization rules">
        <p className="text-xs text-zinc-500 mb-3">
          Teach the importer: transactions matching a rule get your category automatically. Your
          rules run before the built-in ones (gas stations, restaurants, etc.).
        </p>
        {rules.length > 0 && (
          <div className="space-y-2 mb-3">
            {rules.map((r) => (
              <div key={r.id} className="bg-zinc-800 rounded-xl px-3 py-2 flex items-center justify-between text-sm">
                <span className="truncate text-zinc-300">
                  {r.match_field === "amount" ? `amount = ${r.match_pattern}` : `"${r.match_pattern}"`}
                  <span className="text-zinc-500"> → </span>
                  <b>{r.category}</b>
                </span>
                <button onClick={() => deleteRule(r.id)} className="text-zinc-600 pl-2">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mb-2">
          <select value={ruleField} onChange={(e) => setRuleField(e.target.value as any)} className={inputCls + " flex-1"}>
            <option value="merchant">Merchant contains</option>
            <option value="amount">Amount equals</option>
          </select>
          <input
            value={rulePattern}
            onChange={(e) => setRulePattern(e.target.value)}
            placeholder={ruleField === "amount" ? "200 or 195-205" : "e.g. costco"}
            className={inputCls + " flex-1"}
          />
        </div>
        <div className="flex gap-2">
          <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} className={inputCls + " flex-1"}>
            {["Gas", "Eating out", "Car", "School", "Paycheck", "Preaching", "Other"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!rulePattern.trim()) return;
              await addRule({ match_field: ruleField, match_pattern: rulePattern.trim(), category: ruleCategory, priority: 50 });
              setRulePattern("");
            }}
            className="px-4 py-2.5 rounded-xl bg-zinc-700 text-sm font-semibold"
          >
            Add
          </button>
        </div>
      </Card>

      <Card title="Notifications">
        {isIOS() && !isStandalone() && (
          <div className="bg-yellow-950 text-yellow-200 rounded-xl p-3 text-xs mb-3">
            <b>iPhone:</b> Web push requires iOS 16.4+ <b>and</b> the app installed to your Home
            Screen first (Share → Add to Home Screen). Open Runway from the Home Screen icon, then
            enable notifications here.
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm flex items-center gap-2">
            <Bell size={15} /> Push on this device
          </span>
          {pushEnabled ? (
            <button onClick={disablePush} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs font-semibold">
              Disable
            </button>
          ) : (
            <button onClick={enablePush} className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold">
              Enable
            </button>
          )}
        </div>
        {pushMsg && <p className="text-xs text-zinc-400 mb-3">{pushMsg}</p>}
        <div className="space-y-2">
          {toggles.map((t) => (
            <label key={t.key} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{t.label}</span>
              <input
                type="checkbox"
                checked={profile[t.key]}
                onChange={(e) => updateProfile({ [t.key]: e.target.checked } as any)}
                className="h-5 w-5 accent-emerald-600"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-3">
          Daily check runs at 8am ET. Toggles apply to all your devices.
        </p>
      </Card>

      <Card title="Data">
        <button onClick={exportJSON} className="w-full py-2.5 rounded-xl bg-zinc-800 text-sm font-semibold flex items-center justify-center gap-2 mb-3">
          <Download size={14} /> Export backup (JSON)
        </button>
        <div className="border-t border-zinc-800 pt-3">
          <div className="text-xs text-zinc-400 mb-2">Import from v1 artifact JSON</div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
            <input type="checkbox" checked={clearFirst} onChange={(e) => setClearFirst(e.target.checked)}
              className="h-4 w-4 accent-emerald-600" />
            Clear existing transactions/flips/events first (avoids duplicates)
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
          <button onClick={() => fileRef.current?.click()}
            className="w-full py-2.5 rounded-xl bg-zinc-800 text-sm font-semibold flex items-center justify-center gap-2">
            <Upload size={14} /> Choose backup file…
          </button>
          {importMsg && <p className="text-xs text-zinc-400 mt-2">{importMsg}</p>}
        </div>
      </Card>

      <Card title="Account">
        <button onClick={signOut} className="w-full py-2.5 rounded-xl bg-zinc-800 text-sm font-semibold flex items-center justify-center gap-2">
          <LogOut size={14} /> Sign out
        </button>
      </Card>

      <div className="card-glass rounded-3xl p-5 border border-rose-900">
        <div className="text-sm font-semibold text-rose-400 mb-2 flex items-center gap-2">
          <Trash2 size={14} /> Danger zone
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Permanently deletes every transaction, flip, event, and your profile. Type{" "}
          <b className="text-rose-400">DELETE</b> to confirm.
        </p>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE"
          className={inputCls + " mb-3"} />
        <button
          disabled={confirmText !== "DELETE" || deleting}
          onClick={async () => {
            setDeleting(true);
            await deleteAllData();
          }}
          className={`w-full py-2.5 rounded-xl text-sm font-bold ${
            confirmText === "DELETE" && !deleting
              ? "bg-rose-700 text-white"
              : "bg-zinc-800 text-zinc-600"
          }`}
        >
          {deleting ? "Deleting…" : "Delete all data"}
        </button>
      </div>

      <p className="text-center text-xs text-zinc-700 pb-2">Runway v2</p>
    </div>
  );
}
