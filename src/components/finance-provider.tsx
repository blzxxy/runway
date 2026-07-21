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
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import Celebration, { type CelebrationSpec } from "./celebration";
import {
  addDays,
  buildChartSeries,
  buzz,
  computeDerived,
  fmt,
  nextOccurrence,
  sellCalc,
  todayStr,
  type ChartPoint,
  type Derived,
} from "@/lib/finance";
import { V1_FLIP_STATUS } from "@/lib/seed";
import type {
  AddPrefill,
  BankAccount,
  CategoryRule,
  Ev,
  Flip,
  Profile,
  RecurringRule,
  Tx,
} from "@/lib/types";
import QuickAddSheet, { type QuickAddPayload } from "./quick-add";
import TxEditSheet from "./tx-edit";

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
  milestones_reached: Array.isArray(p.milestones_reached) ? p.milestones_reached : [],
  best_streak: num(p.best_streak),
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
const normBank = (b: any): BankAccount => ({ ...b, last_balance: numOrNull(b.last_balance) });
const normRule = (r: any): CategoryRule => ({ ...r, priority: num(r.priority) });

/* ---------- context ---------- */
interface FinanceCtx {
  userId: string;
  today: string;
  profile: Profile;
  txs: Tx[];
  flips: Flip[];
  events: Ev[];
  banks: BankAccount[];
  rules: CategoryRule[];
  derived: Derived;
  chart: ChartPoint[];
  checkingCash: number | null;
  savingsCash: number;
  lastSyncedAt: string | null;
  syncing: boolean;
  refresh: () => Promise<void>;
  openAdd: (prefill?: AddPrefill) => void;
  openTxEdit: (tx: Tx) => void;
  quickLog: (category: string, amount: number) => Promise<string | null>;
  deleteTx: (id: string) => Promise<void>;
  updateTx: (id: string, patch: Partial<Tx>) => Promise<void>;
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
  addRule: (r: Omit<CategoryRule, "id" | "user_id">) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  syncNow: () => Promise<{ imported: number; errors: string[] } | null>;
  disconnectEnrollment: (enrollmentId: string) => Promise<void>;
  toggleBankType: (id: string) => Promise<void>;
  importV1: (json: any, clearFirst: boolean) => Promise<void>;
  deleteAllData: () => Promise<void>;
  signOut: () => Promise<void>;
}

const LEVEL_COLORS: Record<number, string[]> = {
  2: ["#34d399", "#6ee7b7", "#d1fae5"],
  3: ["#f59e0b", "#fcd34d", "#fef3c7"],
  4: ["#f59e0b", "#fde68a", "#ffffff"],
  5: ["#fbbf24", "#fde68a", "#ffffff"],
  6: ["#38bdf8", "#7dd3fc", "#e0f2fe"],
};

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
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [prefill, setPrefill] = useState<AddPrefill | null>(null);
  const [editTarget, setEditTarget] = useState<Tx | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationSpec | null>(null);
  const celebrated = useRef<Set<string>>(new Set());
  const bestStreakSaved = useRef(false);
  const txsRef = useRef<Tx[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncRan = useRef(false);
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
    const [p, t, f, e, b, r] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("flips").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("events").select("*").eq("user_id", userId).order("date"),
      supabase.from("bank_accounts").select("*").eq("user_id", userId).order("type"),
      supabase.from("category_rules").select("*").eq("user_id", userId).order("priority"),
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
    setBanks((b.data ?? []).map(normBank));
    setRules((r.data ?? []).map(normRule));
  }, [supabase, userId, ensureHorizon]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    txsRef.current = txs;
  }, [txs]);

  /* Realtime: any change on another device -> debounce a reload. */
  useEffect(() => {
    const scheduleLoad = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(), 400);
    };
    const channel = supabase.channel("runway-db");
    (["profiles", "transactions", "flips", "events", "bank_accounts"] as const).forEach((table) => {
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

  const syncNow = useCallback(async () => {
    if (syncing) return null;
    setSyncing(true);
    try {
      const res = await fetch("/api/simplefin/sync", { method: "POST" });
      const json = await res.json().catch(() => null);
      await load();
      if (res.ok && json) {
        if (json.imported > 0) {
          toast.success(
            `Imported ${json.imported} transaction${json.imported === 1 ? "" : "s"}${
              json.matched ? ` · ${json.matched} matched to timeline` : ""
            }`,
            { position: "top-center" }
          );
        }
        for (const d of (json.details ?? []).slice(0, 4)) {
          if (d.matchedLabel) {
            toast(
              (t) => (
                <span className="text-sm">
                  Matched to <b>{d.matchedLabel}</b>{" "}
                  <button
                    className="underline font-bold ml-1"
                    onClick={() => {
                      unmatchEvent(d.eventId);
                      toast.dismiss(t.id);
                    }}
                  >
                    undo
                  </button>
                </span>
              ),
              { icon: "🔗", duration: 5000 }
            );
          } else {
            toast(
              (t) => (
                <span className="text-sm">
                  {d.desc} → <b>{d.category}</b>{" "}
                  <button
                    className="underline font-bold ml-1"
                    onClick={() => {
                      const tx = txsRef.current.find((x) => x.id === d.id);
                      if (tx) openTxEdit(tx);
                      toast.dismiss(t.id);
                    }}
                  >
                    change
                  </button>
                </span>
              ),
              { duration: 5000 }
            );
          }
        }
        if (json.errors?.length) toast.error(String(json.errors[0]), { duration: 6000 });
      } else if (!res.ok) {
        toast.error(json?.error ?? "Bank sync failed", { duration: 6000 });
      }
      return res.ok ? json : null;
    } catch {
      return null;
    } finally {
      setSyncing(false);
    }
  }, [syncing, load]);

  /* Auto-sync on open when bank data is >6h stale (free-tier substitute for a 6h cron). */
  useEffect(() => {
    if (autoSyncRan.current || banks.length === 0) return;
    const stale = banks.some(
      (b) => !b.last_synced_at || Date.now() - new Date(b.last_synced_at).getTime() > 6 * 3600 * 1000
    );
    if (stale) {
      autoSyncRan.current = true;
      syncNow();
    } else {
      autoSyncRan.current = true;
    }
  }, [banks, syncNow]);

  const checkingCash = useMemo(() => {
    const checking = banks.filter((b) => b.type === "checking" && b.last_balance != null);
    if (!checking.length) return null;
    return checking.reduce((s, b) => s + (b.last_balance ?? 0), 0);
  }, [banks]);

  const derived = useMemo(
    () => (profile ? computeDerived(profile, txs, flips, events, today, checkingCash) : null),
    [profile, txs, flips, events, today, checkingCash]
  );
  const chart = useMemo(
    () => (profile && derived ? buildChartSeries(profile, txs, derived, today) : []),
    [profile, txs, derived, today]
  );

  const savingsCash = useMemo(
    () => banks.filter((b) => b.type === "savings").reduce((s, b) => s + (b.last_balance ?? 0), 0),
    [banks]
  );
  const lastSyncedAt = useMemo(() => {
    const times = banks.map((b) => b.last_synced_at).filter(Boolean) as string[];
    return times.length ? times.sort().reverse()[0] : null;
  }, [banks]);

  /* ---------- mutations ---------- */
  const openAdd = (p?: AddPrefill) => {
    buzz();
    setPrefill(p ?? null);
    setAddOpen(true);
  };

  const openTxEdit = (tx: Tx) => {
    buzz();
    setEditTarget(tx);
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
    toast.success(p.kind === "flip-sell" ? "Sale logged — payout pending" : "Saved ✓");
  };

  const quickLog = async (category: string, amount: number): Promise<string | null> => {
    const { data } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "expense",
        amount,
        date: todayStr(),
        category,
        note: null,
      })
      .select()
      .single();
    await load();
    buzz(20);
    const id: string | null = data?.id ?? null;
    if (id) {
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Logged {category} {fmt(amount)}
            <button
              className="font-bold underline"
              onClick={() => {
                deleteTx(id);
                toast.dismiss(t.id);
              }}
            >
              Undo
            </button>
          </span>
        ),
        { icon: "✅" }
      );
    }
    return id;
  };

  /** Unlink an auto-matched bank transaction from its timeline event
   *  (keeps the transaction, reverts the event to pending). */
  const unmatchEvent = async (evId: string | null) => {
    if (!evId) return;
    await supabase.from("events").update({ status: "pending", tx_id: null }).eq("id", evId);
    await load();
  };

  const deleteTx = async (id: string) => {
    const tx = txs.find((t) => t.id === id);
    await supabase.from("transactions").delete().eq("id", id);
    const evt = events.find((e) => e.tx_id === id);
    if (evt) await supabase.from("events").update({ status: "pending", tx_id: null }).eq("id", evt.id);
    if (tx?.type === "flip-sell" && tx.flip_id) {
      await supabase.from("flips").update({ status: "sold" }).eq("id", tx.flip_id);
    }
    await load();
  };

  const updateTx = async (id: string, patch: Partial<Tx>) => {
    await supabase.from("transactions").update(patch).eq("id", id);
    await load();
  };

  const linkTxToFlip = async (tx: Tx, flipId: string | "new") => {
    let targetFlipId = flipId;
    if (flipId === "new") {
      const { data: flip } = await supabase
        .from("flips")
        .insert({
          user_id: userId,
          name: (tx.note ?? "Imported purchase").slice(0, 60),
          qty: 1,
          buy_price: tx.amount,
          buy_date: tx.date,
          status: "owned",
          prepaid: false,
          note: "Created from bank transaction",
        })
        .select()
        .single();
      if (!flip) return;
      targetFlipId = flip.id;
    }
    await supabase
      .from("transactions")
      .update({ type: "flip-buy", category: "Flip buy", flip_id: targetFlipId })
      .eq("id", tx.id);
    await load();
    buzz();
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
    toast.success(`${fmt(f.payout, true)} payout added to cash`);
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
    await supabase.from("events").update({ status: "actual", tx_id: tx?.id ?? null }).eq("id", evId);
    await load();
    buzz();
    toast.success(`${e.label} marked actual`);
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
    toast.success("Diamond purchase logged 💎");
  };

  const addRule = async (r: Omit<CategoryRule, "id" | "user_id">) => {
    await supabase.from("category_rules").insert({ ...r, user_id: userId });
    await load();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("category_rules").delete().eq("id", id);
    await load();
  };

  const disconnectEnrollment = async (enrollmentId: string) => {
    await supabase.from("bank_accounts").delete().eq("teller_enrollment_id", enrollmentId);
    await load();
  };

  const toggleBankType = async (id: string) => {
    const b = banks.find((x) => x.id === id);
    if (!b) return;
    await supabase
      .from("bank_accounts")
      .update({ type: b.type === "checking" ? "savings" : "checking" })
      .eq("id", id);
    await load();
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
      supabase.from("bank_accounts").delete().eq("user_id", userId),
      supabase.from("category_rules").delete().eq("user_id", userId),
    ]);
    await supabase.from("profiles").delete().eq("user_id", userId);
    window.location.href = "/onboarding";
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  /* ---------- milestone celebrations ---------- */
  useEffect(() => {
    if (!profile || !derived || celebration) return;
    const m = profile.milestones_reached ?? [];
    const done = (k: string) => m.includes(k) || celebrated.current.has(k);
    const total = profile.ring_diamond_cost + profile.ring_setting_cost;
    let spec: CelebrationSpec | null = null;
    if (!done("ring-diamond") && derived.ringRaised >= profile.ring_diamond_cost) {
      spec = {
        key: "ring-diamond",
        title: "Diamond funded",
        icon: "💎",
        subtitle: "Buy the loose stone before prices shift.",
        cta: "Let's go",
        colors: ["#f59e0b", "#fcd34d", "#fef3c7"],
      };
    } else if (!done("ring-complete") && derived.ringRaised >= total) {
      spec = {
        key: "ring-complete",
        title: "RING COMPLETE 💍",
        subtitle: "Every dollar of the ring is funded.",
        colors: ["#f59e0b", "#fde68a", "#ffffff"],
      };
    } else if (!done("emergency-full") && derived.savings.emergency >= profile.emergency_target) {
      spec = {
        key: "emergency-full",
        title: "Emergency fund secured 🛡",
        subtitle: `${fmt(profile.emergency_target)} buffer in place.`,
        colors: ["#38bdf8", "#7dd3fc", "#e0f2fe"],
      };
    } else if (!done("school-paid") && derived.schoolPaid) {
      spec = {
        key: "school-paid",
        title: "SCHOOL PAID ✓",
        subtitle: "The big one is off your plate. Allocator unlocked.",
        colors: ["#34d399", "#6ee7b7", "#d1fae5"],
      };
    } else if (!done("first-payout")) {
      const paid = flips.find((f) => f.status === "paid_out" && f.payout != null);
      if (paid) {
        spec = {
          key: "first-payout",
          title: "First flip paid out 📦",
          subtitle: `${fmt(paid.payout ?? 0, true)} landed in your account.`,
          colors: ["#a78bfa", "#c4b5fd", "#ede9fe"],
        };
      }
    }
    if (!spec) {
      for (let k = 2; k <= derived.level; k++) {
        if (!done(`level-${k}`)) {
          spec = {
            key: `level-${k}`,
            title: `LEVEL ${k} ✨`,
            subtitle: `${derived.levelName} — ${fmt(derived.lifetimeSaved)} lifetime saved`,
            colors: LEVEL_COLORS[k] ?? ["#f59e0b", "#ffffff"],
          };
          break;
        }
      }
    }
    if (spec) setCelebration(spec);
  }, [profile, derived, flips, celebration]);

  const dismissCelebration = async () => {
    if (!celebration || !profile) return;
    celebrated.current.add(celebration.key);
    const m = profile.milestones_reached ?? [];
    const key = celebration.key;
    setCelebration(null);
    await supabase
      .from("profiles")
      .update({ milestones_reached: [...m, key] })
      .eq("user_id", userId);
    await load();
  };

  /* persist best budget streak */
  useEffect(() => {
    if (!profile || !derived || bestStreakSaved.current) return;
    if (derived.streak > (profile.best_streak ?? 0)) {
      bestStreakSaved.current = true;
      supabase
        .from("profiles")
        .update({ best_streak: derived.streak })
        .eq("user_id", userId)
        .then(() => load());
    }
  }, [profile, derived, supabase, userId, load]);

  if (!profile || !derived) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
        banks,
        rules,
        derived,
        chart,
        checkingCash,
        savingsCash,
        lastSyncedAt,
        syncing,
        refresh: load,
        openAdd,
        openTxEdit,
        quickLog,
        deleteTx,
        updateTx,
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
        addRule,
        deleteRule,
        syncNow,
        disconnectEnrollment,
        toggleBankType,
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
      {celebration && <Celebration spec={celebration} onDismiss={dismissCelebration} />}
      {editTarget && (
        <TxEditSheet
          tx={editTarget}
          flips={flips}
          onClose={() => setEditTarget(null)}
          onSave={(patch) => updateTx(editTarget.id, patch)}
          onLinkFlip={(flipId) => linkTxToFlip(editTarget, flipId)}
          onDelete={() => deleteTx(editTarget.id)}
        />
      )}
    </Ctx.Provider>
  );
}
