"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addBusinessDays,
  addDays,
  buildChartSeries,
  buzz,
  computeDerived,
  nextOccurrence,
  sellCalc,
  todayStr,
  type ChartPoint,
  type Derived,
} from "@/lib/finance";
import { V1_FLIP_STATUS } from "@/lib/seed";
import type { AddPrefill, Ev, Flip, Profile, RecurringRule, Tx } from "@/lib/types";
import QuickAddSheet, { type QuickAddPayload } from "./quick-add";

/* ---------- normalization: Postgres numeric arrives as string ---------- */
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

const normProfile = (p: any): Profile => ({
  ...p,
  starting_cash: num(p.starting_cash),
  weekly_budget: num(p.weekly_budget),
  alloc_ring: num(p.alloc_ring),
  alloc_emergency: num(p.alloc_emergency),
  alloc_flex: num(p.alloc_flex),
  school_amount: numOrNull(p.school_amount),
  ring_diamond_cost: num(p.ring_diamond_cost),
  ring_setting_cost: num(p.ring_setting_cost),
  emergency_target: num(p.emergency_target),
});
const normTx = (t: any): Tx => ({ ...t, amount: num(t.amount) });
const normFlip = (f: any): Flip => ({
  ...f,
  qty: num(f.qty),
  buy_price: num(f.buy_price),
  list_price: numOrNull(f.list_price),
  sold_price: numOrNull(f.sold_price),
  shipping: num(f.shipping),
  fees_paid: numOrNull(f.fees_paid),
  payout: numOrNull(f.payout),
});
const normEv = (e: any): Ev => ({ ...e, amount: num(e.amount) });

/* ---------- context ---------- */
interface FinanceCtx {
  userId: string;
  today: string;
  profile: Profile;
  txs: Tx[];
  flips: Flip[];
  events: Ev[];
  derived: Derived;
  chart: ChartPoint[];
  refresh: () => Promise<void>;
  openAdd: (prefill?: AddPrefill) => void;
  deleteTx: (id: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateFlip: (id: string, patch: Partial<Flip>) => Promise<void>;
  deleteFlip: (id: string) => Promise<void>;
  payoutFlip: (id: string) => Promise<void>;
  markActual: (evId: string, amountOverride?: number) => Promise<void>;
  dismissEvent: (evId: string) => Promise<void>;
  undoActual: (evId: string) => Promise<void>;
  addRecurring: (r: {
    label: string;
    amount: number;
    category: string;
    start: string;
    rule: RecurringRule;
  }) => Promise<void>;
  updateSeries: (rootId: string, patch: { label?: string; amount?: number }) => Promise<void>;
  stopSeries: (rootId: string) => Promise<void>;
  ringPurchase: (p: { amount: number; date: string; note: string }) => Promise<void>;
  importV1: (json: any, clearFirst: boolean) => Promise<void>;
  deleteAllData: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<FinanceCtx | null>(null);

export const useFinance = (): FinanceCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFinance must be used inside FinanceProvider");
  return c;
};

export default function FinanceProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [flips, setFlips] = useState<Flip[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [prefill, setPrefill] = useState<AddPrefill | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = todayStr();

  /* Keep at least 8 weeks of recurring events materialized. */
  const ensureHorizon = useCallback(
    async (evts: Ev[]): Promise<boolean> => {
      const horizon = addDays(todayStr(), 56);
      const series = new Map<string, Ev[]>();
      for (const e of evts) {
        if (!e.recurring_rule) continue;
        const root = e.recurring_source_id ?? e.id;
        const arr = series.get(root) ?? [];
        arr.push(e);
        series.set(root, arr);
      }
      const inserts: any[] = [];
      series.forEach((arr, root) => {
        arr.sort((a, b) => (a.date < b.date ? -1 : 1));
        const last = arr[arr.length - 1];
        const rule = last.recurring_rule as RecurringRule;
        let d = last.date;
        let guard = 0;
        while (d < horizon && guard++ < 24) {
          d = nextOccurrence(d, rule);
          if (
            d <= horizon &&
            !arr.some((e) => e.date === d) &&
            !inserts.some((i) => i.recurring_source_id === root && i.date === d)
          ) {
            inserts.push({
              user_id: userId,
              date: d,
              label: last.label,
              amount: last.amount,
              category: last.category,
              status: "pending",
              recurring_rule: rule,
              recurring_source_id: root,
            });
          }
        }
      });
      if (inserts.length) {
        await supabase.from("events").insert(inserts);
        return true;
      }
      return false;
    },
    [supabase, userId]
  );

  const load = useCallback(async () => {
    const [p, t, f, e] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("flips").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("events").select("*").eq("user_id", userId).order("date"),
    ]);
    if (p.data) setProfile(normProfile(p.data));
    let evts = (e.data ?? []).map(normEv);
    if (await ensureHorizon(evts)) {
      const again = await supabase.from("events").select("*").eq("user_id", userId).order("date");
      evts = (again.data ?? []).map(normEv);
    }
    setTxs((t.data ?? []).map(normTx));
    setFlips((f.data ?? []).map(normFlip));
    setEvents(evts);
  }, [supabase, userId, ensureHorizon]);

  useEffect(() => {
    load();
  }, [load]);

  /* Realtime: any change on another device -> debounce a reload. */
  useEffect(() => {
    const scheduleLoad = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(), 400);
    };
    const channel = supabase.channel("runway-db");
    (["profiles", "transactions", "flips", "events"] as const).forEach((table) => {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` } as any,
        scheduleLoad
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  const derived = useMemo(
    () => (profile ? computeDerived(profile, txs, flips, events, today) : null),
    [profile, txs, flips, events, today]
  );
  const chart = useMemo(
    () => (profile && derived ? buildChartSeries(profile, txs, derived, today) : []),
    [profile, txs, derived, today]
  );

  /* ---------- mutations ---------- */
  const openAdd = (p?: AddPrefill) => {
    buzz();
    setPrefill(p ?? null);
    setAddOpen(true);
  };

  const handleQuickAdd = async (p: QuickAddPayload) => {
    if (p.kind === "tx") {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: p.type,
        amount: p.amount,
        date: p.date,
        category: p.category,
        note: p.note || null,
        target: p.type === "savings" ? p.target ?? "ring" : null,
      });
    } else if (p.kind === "flip-buy") {
      const { data: flip } = await supabase
        .from("flips")
        .insert({
          user_id: userId,
          name: p.name,
          qty: p.qty,
          buy_price: p.priceEach,
          buy_date: p.date,
          list_price: p.listPrice,
          status: "owned",
          prepaid: false,
        })
        .select()
        .single();
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "flip-buy",
        amount: p.priceEach * p.qty,
        date: p.date,
        category: "Flip buy",
        note: p.name,
        flip_id: flip?.id ?? null,
      });
    } else if (p.kind === "flip-sell") {
      const f = flips.find((x) => x.id === p.flipId);
      if (f) {
        const calc = sellCalc(p.priceEach, f.qty, p.shipping);
        await supabase
          .from("flips")
          .update({
            sold_price: p.priceEach,
            sold_date: p.date,
            shipping: p.shipping,
            fees_paid: Math.round(calc.fees * 100) / 100,
            payout: Math.round(calc.payout * 100) / 100,
            expected_payout_date: p.expectedPayoutDate,
            status: "sold",
          })
          .eq("id", f.id);
      }
    }
    await load();
    setAddOpen(false);
    setPrefill(null);
    buzz();
  };

  const deleteTx = async (id: string) => {
    const tx = txs.find((t) => t.id === id);
    await supabase.from("transactions").delete().eq("id", id);
    // Reset any event that pointed at this transaction
    const evt = events.find((e) => e.tx_id === id);
    if (evt) await supabase.from("events").update({ status: "pending", tx_id: null }).eq("id", evt.id);
    // Roll a paid-out flip back to sold (payout pending again)
    if (tx?.type === "flip-sell" && tx.flip_id) {
      await supabase.from("flips").update({ status: "sold" }).eq("id", tx.flip_id);
    }
    await load();
  };

  const updateProfile = async (patch: Partial<Profile>) => {
    await supabase.from("profiles").update(patch).eq("user_id", userId);
    await load();
  };

  const updateFlip = async (id: string, patch: Partial<Flip>) => {
    await supabase.from("flips").update(patch).eq("id", id);
    await load();
  };

  const deleteFlip = async (id: string) => {
    await supabase.from("flips").delete().eq("id", id);
    await load();
  };

  const payoutFlip = async (id: string) => {
    const f = flips.find((x) => x.id === id);
    if (!f || f.payout == null) return;
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "flip-sell",
      amount: f.payout,
      date: todayStr(),
      category: "Flip sale",
      note: `${f.name} — eBay payout`,
      flip_id: f.id,
    });
    await supabase.from("flips").update({ status: "paid_out" }).eq("id", id);
    await load();
    buzz();
  };

  const markActual = async (evId: string, amountOverride?: number) => {
    const e = events.find((x) => x.id === evId);
    if (!e || e.status !== "pending") return;
    const amount = Math.abs(amountOverride ?? e.amount);
    const { data: tx } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: e.amount > 0 ? "income" : "expense",
        amount,
        date: e.date >= today ? e.date : today,
        category: e.category,
        note: e.label,
      })
      .select()
      .single();
    await supabase
      .from("events")
      .update({ status: "actual", tx_id: tx?.id ?? null })
      .eq("id", evId);
    await load(); // ensureHorizon inside load() spawns the next recurring occurrence
    buzz();
  };

  const dismissEvent = async (evId: string) => {
    await supabase.from("events").update({ status: "dismissed" }).eq("id", evId);
    await load();
  };

  const undoActual = async (evId: string) => {
    const e = events.find((x) => x.id === evId);
    if (!e) return;
    if (e.tx_id) await supabase.from("transactions").delete().eq("id", e.tx_id);
    await supabase.from("events").update({ status: "pending", tx_id: null }).eq("id", evId);
    await load();
  };

  const addRecurring = async (r: {
    label: string;
    amount: number;
    category: string;
    start: string;
    rule: RecurringRule;
  }) => {
    await supabase.from("events").insert({
      user_id: userId,
      date: r.start,
      label: r.label,
      amount: r.amount,
      category: r.category,
      status: "pending",
      recurring_rule: r.rule,
    });
    await load();
  };

  const updateSeries = async (rootId: string, patch: { label?: string; amount?: number }) => {
    await supabase
      .from("events")
      .update(patch)
      .or(`id.eq.${rootId},recurring_source_id.eq.${rootId}`)
      .eq("status", "pending");
    await load();
  };

  const stopSeries = async (rootId: string) => {
    await supabase
      .from("events")
      .delete()
      .or(`id.eq.${rootId},recurring_source_id.eq.${rootId}`)
      .eq("status", "pending");
    await load();
  };

  const ringPurchase = async (p: { amount: number; date: string; note: string }) => {
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "ring-purchase",
      amount: p.amount,
      date: p.date,
      category: "Ring",
      note: p.note || "Loose diamond purchase",
    });
    await load();
    buzz(30);
  };

  const importV1 = async (json: any, clearFirst: boolean) => {
    if (clearFirst) {
      await Promise.all([
        supabase.from("transactions").delete().eq("user_id", userId),
        supabase.from("flips").delete().eq("user_id", userId),
        supabase.from("events").delete().eq("user_id", userId),
      ]);
    }
    const patch: any = {};
    if (json.startingCash != null) patch.starting_cash = Number(json.startingCash);
    if (json.settings?.weeklyBudget != null) patch.weekly_budget = Number(json.settings.weeklyBudget);
    if (json.settings?.alloc) {
      patch.alloc_ring = Number(json.settings.alloc.ring ?? 1200);
      patch.alloc_emergency = Number(json.settings.alloc.emergency ?? 300);
      patch.alloc_flex = Number(json.settings.alloc.flex ?? 218);
    }
    if (Object.keys(patch).length) {
      await supabase.from("profiles").update(patch).eq("user_id", userId);
    }
    if (Array.isArray(json.transactions) && json.transactions.length) {
      await supabase.from("transactions").insert(
        json.transactions.map((t: any) => ({
          user_id: userId,
          type: t.type,
          amount: Number(t.amount),
          date: t.date,
          category: t.category ?? null,
          note: t.note ?? null,
          target: t.target ?? null,
        }))
      );
    }
    if (Array.isArray(json.flips) && json.flips.length) {
      await supabase.from("flips").insert(
        json.flips.map((f: any) => ({
          user_id: userId,
          name: f.name,
          qty: Number(f.qty ?? 1),
          buy_price: Number(f.buyPrice ?? 0),
          buy_date: f.buyDate ?? null,
          list_price: f.listPrice != null ? Number(f.listPrice) : null,
          sold_price: f.soldPrice != null ? Number(f.soldPrice) : null,
          sold_date: f.soldDate ?? null,
          shipping: Number(f.shipping ?? 11),
          payout: f.payout != null ? Number(f.payout) : null,
          status: V1_FLIP_STATUS[f.status] ?? "owned",
          prepaid: !!f.prepaid,
          note: f.note ?? null,
        }))
      );
    }
    if (Array.isArray(json.events) && json.events.length) {
      await supabase.from("events").insert(
        json.events.map((e: any) => ({
          user_id: userId,
          date: e.date,
          label: e.label,
          amount: Number(e.amount),
          category: e.category ?? null,
          status: e.status === "actual" ? "actual" : e.status === "dismissed" ? "dismissed" : "pending",
        }))
      );
    }
    await load();
  };

  const deleteAllData = async () => {
    await Promise.all([
      supabase.from("transactions").delete().eq("user_id", userId),
      supabase.from("flips").delete().eq("user_id", userId),
      supabase.from("events").delete().eq("user_id", userId),
      supabase.from("push_subscriptions").delete().eq("user_id", userId),
    ]);
    await supabase.from("profiles").delete().eq("user_id", userId);
    window.location.href = "/onboarding";
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (!profile || !derived) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm animate-pulse">Loading your money…</div>
      </div>
    );
  }

  return (
    <Ctx.Provider
      value={{
        userId,
        today,
        profile,
        txs,
        flips,
        events,
        derived,
        chart,
        refresh: load,
        openAdd,
        deleteTx,
        updateProfile,
        updateFlip,
        deleteFlip,
        payoutFlip,
        markActual,
        dismissEvent,
        undoActual,
        addRecurring,
        updateSeries,
        stopSeries,
        ringPurchase,
        importV1,
        deleteAllData,
        signOut,
      }}
    >
      {children}
      {addOpen && (
        <QuickAddSheet
          flips={flips}
          prefill={prefill}
          onClose={() => {
            setAddOpen(false);
            setPrefill(null);
          }}
          onSubmit={handleQuickAdd}
        />
      )}
    </Ctx.Provider>
  );
}
