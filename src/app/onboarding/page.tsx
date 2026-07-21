"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight, Gem, Share, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULTS, SEED_FLIPS, SEED_ONE_TIME, SEED_RECURRING } from "@/lib/seed";
import { isIOS, isStandalone, subscribeToPush } from "@/lib/push";
import SimpleFinConnect from "@/components/simplefin-connect";

const inputCls =
  "w-full bg-zinc-800 rounded-xl px-4 py-3 text-zinc-100 outline-none border border-zinc-700 focus:border-zinc-500";

interface PaycheckRow {
  include: boolean;
  label: string;
  amount: string;
  start: string;
  rule: "biweekly" | "monthly";
  deductionLabel: string;
  deductionAmount: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [bankLinked, setBankLinked] = useState<string | null>(null);

  // Step state (defaults = Ethan's current situation)
  const [cash, setCash] = useState(String(DEFAULTS.starting_cash));
  const [schoolAmount, setSchoolAmount] = useState(String(DEFAULTS.school_amount));
  const [schoolDate, setSchoolDate] = useState(DEFAULTS.school_due_date);
  const [includeSchool, setIncludeSchool] = useState(true);
  const [emergencyTarget, setEmergencyTarget] = useState(String(DEFAULTS.emergency_target));
  const [diamondCost, setDiamondCost] = useState(String(DEFAULTS.ring_diamond_cost));
  const [settingCost, setSettingCost] = useState(String(DEFAULTS.ring_setting_cost));
  const [includeFlips, setIncludeFlips] = useState(true);
  const [paychecks, setPaychecks] = useState<PaycheckRow[]>([
    {
      include: true,
      label: "Payday — Main job",
      amount: "752",
      start: "2026-07-30",
      rule: "biweekly",
      deductionLabel: "Car payment + insurance",
      deductionAmount: "200",
    },
    {
      include: true,
      label: "Payday — New job",
      amount: "480",
      start: "2026-08-19",
      rule: "biweekly",
      deductionLabel: "",
      deductionAmount: "",
    },
  ]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("user_id", user.id)
        .maybeSingle();
      if (p?.onboarded) router.replace("/");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPay = (i: number, patch: Partial<PaycheckRow>) =>
    setPaychecks((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const finish = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await supabase.from("profiles").upsert({
        user_id: userId,
        starting_cash: parseFloat(cash) || DEFAULTS.starting_cash,
        weekly_budget: DEFAULTS.weekly_budget,
        alloc_ring: DEFAULTS.alloc_ring,
        alloc_emergency: DEFAULTS.alloc_emergency,
        alloc_flex: DEFAULTS.alloc_flex,
        school_due_date: includeSchool ? schoolDate || null : null,
        school_amount: includeSchool ? parseFloat(schoolAmount) || null : null,
        ring_diamond_cost: parseFloat(diamondCost) || 600,
        ring_setting_cost: parseFloat(settingCost) || 1400,
        emergency_target: parseFloat(emergencyTarget) || 450,
        onboarded: true,
      });

      const events: any[] = [];
      for (const p of paychecks) {
        if (!p.include) continue;
        const amt = parseFloat(p.amount) || 0;
        if (amt > 0)
          events.push({
            user_id: userId,
            date: p.start,
            label: p.label || "Payday",
            amount: amt,
            category: "Paycheck",
            status: "pending",
            recurring_rule: p.rule,
          });
        const ded = parseFloat(p.deductionAmount) || 0;
        if (ded > 0 && p.deductionLabel.trim())
          events.push({
            user_id: userId,
            date: p.start,
            label: p.deductionLabel.trim(),
            amount: -ded,
            category: "Car",
            status: "pending",
            recurring_rule: p.rule,
          });
      }
      if (includeSchool && schoolDate && parseFloat(schoolAmount) > 0)
        events.push({
          user_id: userId,
          date: schoolDate,
          label: "School payment",
          amount: -Math.abs(parseFloat(schoolAmount)),
          category: "School",
          status: "pending",
        });
      for (const o of SEED_ONE_TIME)
        events.push({
          user_id: userId,
          date: o.date,
          label: o.label,
          amount: o.amount,
          category: o.category,
          status: "pending",
        });
      if (events.length) await supabase.from("events").insert(events);

      if (includeFlips) {
        await supabase
          .from("flips")
          .insert(SEED_FLIPS.map((f) => ({ ...f, user_id: userId })));
      }
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "Welcome to Runway",
      body: (
        <div className="space-y-4">
          <div className="bg-amber-500 rounded-3xl p-4 w-fit mx-auto">
            <Gem size={32} className="text-zinc-950" />
          </div>
          <p className="text-sm text-zinc-400 text-center">
            Runway tracks your <b className="text-zinc-200">cash balance</b>, projects it across
            every upcoming paycheck and bill, watches your{" "}
            <b className="text-amber-300">ring fund</b> and{" "}
            <b className="text-sky-300">emergency buffer</b>, and handles the fee math on your{" "}
            <b className="text-violet-300">card flips</b>. Everything syncs across your devices.
          </p>
          <p className="text-xs text-zinc-600 text-center">
            Every step can be skipped — defaults match a sensible starting setup.
          </p>
        </div>
      ),
    },
    {
      title: "Connect your bank",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Link your checking + savings through SimpleFIN and Runway auto-imports transactions, categorizes them
            (gas, eating out, paychecks…), and shows your <b className="text-zinc-200">real bank
            balance</b> instead of a running guess. Skip to stay fully manual.
          </p>
          {bankLinked ? (
            <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-3 text-sm text-emerald-200">
              ✓ {bankLinked} connected — balances and transactions imported.
            </div>
          ) : (
            <SimpleFinConnect
              onConnected={(res) => {
                const checking = (res.accounts ?? []).find((a: any) => a.type === "checking");
                if (checking?.last_balance != null) setCash(String(checking.last_balance));
                setBankLinked(
                  (res.accounts ?? []).map((a: any) => a.name).join(", ") || "Bank"
                );
              }}
            />
          )}
          <p className="text-xs text-zinc-600">
            Your bank login stays with SimpleFIN Bridge ($1.50/mo or $15/yr) — this app only ever sees
            read-only balances and transactions. Disconnect any time in Settings.
          </p>
        </div>
      ),
    },
    {
      title: "Starting cash",
      body: (
        <div>
          <p className="text-sm text-zinc-400 mb-3">
            What's in your account right now? This is the baseline every projection builds on.{bankLinked ? " (Pre-filled from your bank.)" : ""}
          </p>
          <div className="flex items-center bg-zinc-800 rounded-xl border border-zinc-700 px-4">
            <span className="text-2xl text-zinc-500 mr-1">$</span>
            <input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal"
              className="w-full bg-transparent py-3 text-3xl font-bold outline-none" />
          </div>
        </div>
      ),
    },
    {
      title: "School payment",
      body: (
        <div>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={includeSchool} onChange={(e) => setIncludeSchool(e.target.checked)}
              className="h-5 w-5 accent-emerald-600" />
            I have a school payment coming up
          </label>
          {includeSchool && (
            <>
              <label className="text-xs text-zinc-400">Amount</label>
              <div className="flex items-center bg-zinc-800 rounded-xl border border-zinc-700 px-3 mt-1 mb-3">
                <span className="text-zinc-500 mr-1">$</span>
                <input value={schoolAmount} onChange={(e) => setSchoolAmount(e.target.value)} inputMode="decimal"
                  className="w-full bg-transparent py-2.5 font-bold outline-none" />
              </div>
              <label className="text-xs text-zinc-400">Due date</label>
              <input type="date" value={schoolDate} onChange={(e) => setSchoolDate(e.target.value)}
                className={inputCls + " mt-1"} />
            </>
          )}
        </div>
      ),
    },
    {
      title: "Savings goals",
      body: (
        <div>
          <label className="text-xs text-amber-400">Ring — diamond cost (buy first)</label>
          <div className="flex items-center bg-zinc-800 rounded-xl border border-zinc-700 px-3 mt-1 mb-3">
            <span className="text-zinc-500 mr-1">$</span>
            <input value={diamondCost} onChange={(e) => setDiamondCost(e.target.value)} inputMode="decimal"
              className="w-full bg-transparent py-2.5 outline-none" />
          </div>
          <label className="text-xs text-amber-400">Ring — setting cost</label>
          <div className="flex items-center bg-zinc-800 rounded-xl border border-zinc-700 px-3 mt-1 mb-3">
            <span className="text-zinc-500 mr-1">$</span>
            <input value={settingCost} onChange={(e) => setSettingCost(e.target.value)} inputMode="decimal"
              className="w-full bg-transparent py-2.5 outline-none" />
          </div>
          <label className="text-xs text-sky-400">Emergency buffer target</label>
          <div className="flex items-center bg-zinc-800 rounded-xl border border-zinc-700 px-3 mt-1 mb-3">
            <span className="text-zinc-500 mr-1">$</span>
            <input value={emergencyTarget} onChange={(e) => setEmergencyTarget(e.target.value)} inputMode="decimal"
              className="w-full bg-transparent py-2.5 outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={includeFlips} onChange={(e) => setIncludeFlips(e.target.checked)}
              className="h-5 w-5 accent-emerald-600" />
            Pre-load my Pokémon TCG flips (ETBs + Prismatic SPC)
          </label>
        </div>
      ),
    },
    {
      title: "Recurring paychecks",
      body: (
        <div className="space-y-4">
          {paychecks.map((p, i) => (
            <div key={i} className="bg-zinc-800 rounded-2xl p-3">
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" checked={p.include} onChange={(e) => setPay(i, { include: e.target.checked })}
                  className="h-5 w-5 accent-emerald-600" />
                <input value={p.label} onChange={(e) => setPay(i, { label: e.target.value })}
                  className="flex-1 bg-transparent font-semibold outline-none" />
              </label>
              {p.include && (
                <>
                  <div className="flex gap-2 mb-2">
                    <div className="flex items-center bg-zinc-900 rounded-xl px-3 flex-1">
                      <span className="text-zinc-500 mr-1">$</span>
                      <input value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} inputMode="decimal"
                        className="w-full bg-transparent py-2 outline-none" />
                    </div>
                    <select value={p.rule} onChange={(e) => setPay(i, { rule: e.target.value as any })}
                      className="bg-zinc-900 rounded-xl px-2 py-2 text-sm outline-none flex-1">
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <label className="text-xs text-zinc-500">Next payday</label>
                  <input type="date" value={p.start} onChange={(e) => setPay(i, { start: e.target.value })}
                    className="w-full bg-zinc-900 rounded-xl px-3 py-2 mt-1 mb-2 text-sm outline-none" />
                  <label className="text-xs text-zinc-500">Linked deduction (optional)</label>
                  <div className="flex gap-2 mt-1">
                    <input value={p.deductionLabel} onChange={(e) => setPay(i, { deductionLabel: e.target.value })}
                      placeholder="e.g. Car payment" className="flex-1 bg-zinc-900 rounded-xl px-3 py-2 text-sm outline-none" />
                    <div className="flex items-center bg-zinc-900 rounded-xl px-3 w-24">
                      <span className="text-zinc-500 mr-1">$</span>
                      <input value={p.deductionAmount} onChange={(e) => setPay(i, { deductionAmount: e.target.value })}
                        inputMode="decimal" className="w-full bg-transparent py-2 text-sm outline-none" />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Install to Home Screen",
      body: (
        <div className="space-y-3 text-sm text-zinc-400">
          <div className="bg-zinc-800 rounded-2xl p-4">
            <p className="font-semibold text-zinc-200 mb-2 flex items-center gap-2">
              <Share size={16} /> On iPhone (Safari)
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Tap the Share button (square with arrow)</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Tap "Add" — Runway appears like a native app</li>
            </ol>
          </div>
          <p className="text-xs text-zinc-600">
            Installing is required for push notifications on iPhone (iOS 16.4+). You can do this
            any time.
          </p>
        </div>
      ),
    },
    {
      title: "Notifications",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Get a morning push for paydays, school-payment reminders, budget warnings, and the ring
            fund milestone.
          </p>
          {isIOS() && !isStandalone() && (
            <div className="bg-yellow-950 text-yellow-200 rounded-xl p-3 text-xs">
              You're in the browser — on iPhone, notifications only work after installing to the
              Home Screen (previous step) and opening the app from there. Skip for now and enable
              later in Settings.
            </div>
          )}
          <button
            onClick={async () => {
              setPushMsg(null);
              try {
                if (!userId) return;
                await subscribeToPush(supabase, userId);
                setPushMsg("Notifications enabled ✓");
              } catch (e: any) {
                setPushMsg(e?.message ?? "Couldn't enable — you can retry in Settings.");
              }
            }}
            className="w-full py-3 rounded-2xl bg-emerald-700 text-white font-bold flex items-center justify-center gap-2"
          >
            <Bell size={16} /> Enable notifications
          </button>
          {pushMsg && <p className="text-xs text-zinc-400">{pushMsg}</p>}
        </div>
      ),
    },
  ];

  const last = step === steps.length - 1;

  return (
    <div className="min-h-screen text-zinc-100 flex flex-col">
      <div className="max-w-md mx-auto w-full px-6 pt-10 pb-8 flex-1 flex flex-col">
        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-emerald-500" : "bg-zinc-800"}`} />
          ))}
        </div>
        <h1 className="text-2xl font-extrabold mb-4">{steps[step].title}</h1>
        <div className="flex-1">{steps[step].body}</div>
        <div className="flex gap-3 mt-8">
          {!last && (
            <button onClick={() => (last ? finish() : setStep(step + 1))}
              className="px-4 py-3.5 rounded-2xl bg-zinc-900 text-zinc-400 text-sm font-semibold">
              Skip
            </button>
          )}
          <button
            onClick={() => (last ? finish() : setStep(step + 1))}
            disabled={busy}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-1"
          >
            {busy ? "Setting up…" : last ? "Finish — open Runway" : "Next"}
            {!busy && !last && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
