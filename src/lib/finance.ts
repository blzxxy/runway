import type { Ev, Flip, Profile, Tx } from "./types";

export const FEE_PCT = 0.1325;
export const FEE_FLAT = 0.3;

/* ---------- dates ---------- */
export const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayStr = () => toYMD(new Date());
export const fromYMD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
export const addDays = (s: string, n: number) => {
  const d = fromYMD(s);
  d.setDate(d.getDate() + n);
  return toYMD(d);
};
export const addMonths = (s: string, n: number) => {
  const d = fromYMD(s);
  d.setMonth(d.getMonth() + n);
  return toYMD(d);
};
export const daysUntil = (s: string, from?: string) =>
  Math.round((fromYMD(s).getTime() - fromYMD(from ?? todayStr()).getTime()) / 86400000);
export const fmtDate = (s: string) =>
  fromYMD(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const weekStartOf = (s: string) => {
  const d = fromYMD(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return toYMD(d);
};
export const addBusinessDays = (s: string, n: number) => {
  const d = fromYMD(s);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return toYMD(d);
};
export const nextOccurrence = (s: string, rule: "biweekly" | "monthly") =>
  rule === "biweekly" ? addDays(s, 14) : addMonths(s, 1);

/* ---------- money ---------- */
export const fmt = (n: number, cents = false) => {
  const neg = n < 0;
  const a = Math.abs(n);
  const str = a.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : a % 1 ? 2 : 0,
  });
  return (neg ? "-$" : "$") + str;
};

/** Lowest sale price (each) that still breaks even after eBay fees + shipping. */
export const breakEvenPrice = (costTotal: number, qty: number, shippingEach: number) =>
  (costTotal / qty + FEE_FLAT + shippingEach) / (1 - FEE_PCT);

export const sellCalc = (priceEach: number, qty: number, shippingEach: number) => {
  const gross = priceEach * qty;
  const fees = gross * FEE_PCT + FEE_FLAT * qty;
  const ship = shippingEach * qty;
  return { gross, fees, ship, payout: gross - fees - ship };
};

export const LEVELS = [
  { level: 1, name: "Getting Started", min: 0 },
  { level: 2, name: "Building Momentum", min: 250 },
  { level: 3, name: "Halfway Home", min: 600 },
  { level: 4, name: "Ring Ready", min: 1500 },
  { level: 5, name: "Ring Complete", min: 2000 },
];

export const buzz = (ms = 12) => {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {}
};

/* ---------- cash effect of a transaction ---------- */
export function txCashDelta(t: Tx): number {
  switch (t.type) {
    case "income":
    case "flip-sell":
      return t.amount;
    case "expense":
    case "flip-buy":
    case "savings":
      return -t.amount;
    case "ring-purchase":
      return 0; // paid out of the ring fund, not cash
    default:
      return 0;
  }
}

/* ---------- derived state ---------- */
export interface ProjItem {
  id: string;
  date: string;
  label: string;
  amount: number;
  dynamic?: boolean;
  recurring?: boolean;
  balAfter: number;
}

export function computeDerived(
  profile: Profile,
  txs: Tx[],
  flips: Flip[],
  events: Ev[],
  today = todayStr(),
  bankCash: number | null = null
) {
  let cash = profile.starting_cash;
  const savings: Record<string, number> = { ring: 0, emergency: 0, house: 0 };
  let ringSpent = 0;
  for (const t of txs) {
    cash += txCashDelta(t);
    if (t.type === "savings" && t.target) savings[t.target] = (savings[t.target] || 0) + t.amount;
    if (t.type === "ring-purchase") ringSpent += t.amount;
  }
  const ringRaised = savings.ring;
  const ringBalance = ringRaised - ringSpent;
  const diamondPurchased = ringSpent > 0;

  const ws = weekStartOf(today);
  const weekSpent = txs
    .filter(
      (t) =>
        t.type === "expense" &&
        (t.category === "Gas" || t.category === "Eating out") &&
        weekStartOf(t.date) === ws
    )
    .reduce((s, t) => s + t.amount, 0);
  // portion of this week's gas+food the BANK has already posted (source teller)
  const weekSpentPosted = txs
    .filter(
      (t) =>
        t.type === "expense" &&
        t.source === "teller" &&
        (t.category === "Gas" || t.category === "Eating out") &&
        weekStartOf(t.date) === ws
    )
    .reduce((s, t) => s + t.amount, 0);
  const dayIdx = ((fromYMD(today).getDay() + 6) % 7) + 1;
  const pace = (weekSpent / dayIdx) * 7;

  // Budget streak: consecutive days (ending today) where the running weekly
  // gas+food total never exceeded the budget. Bounded by first transaction.
  let streak = 0;
  if (txs.length) {
    const firstDate = txs.reduce((min, t) => (t.date < min ? t.date : min), today);
    for (let i = 0; i < 366; i++) {
      const day = addDays(today, -i);
      if (day < firstDate) break;
      const wsDay = weekStartOf(day);
      const spent = txs
        .filter(
          (t) =>
            t.type === "expense" &&
            (t.category === "Gas" || t.category === "Eating out") &&
            t.date >= wsDay &&
            t.date <= day
        )
        .reduce((s, t) => s + t.amount, 0);
      if (spent > profile.weekly_budget) break;
      streak++;
    }
  }

  const pendingFlips = flips.filter((f) => f.status === "sold");
  const pendingPayoutTotal = pendingFlips.reduce((s, f) => s + (f.payout ?? 0), 0);

  // ---- projection through an 8-week horizon ----
  const horizon = addDays(today, 56);
  const pending = events.filter((e) => e.status === "pending" && e.date <= horizon);

  // Reserve gas+food budget conservatively: the rest of THIS week's budget is
  // set aside immediately, and each future week's budget on its Monday — so
  // early-week days right before a payday are never left uncovered.
  const drains: ProjItem[] = [];
  const remainingThisWeek = Math.max(0, profile.weekly_budget - weekSpent);
  if (remainingThisWeek > 0)
    drains.push({
      id: "wk-now",
      date: today,
      label: "Gas + food budget (rest of this week)",
      amount: -remainingThisWeek,
      dynamic: true,
      balAfter: 0,
    });
  let monday = addDays(weekStartOf(today), 7);
  while (monday <= horizon) {
    drains.push({
      id: "wk-" + monday,
      date: monday,
      label: `Gas + food budget (week of ${fmtDate(monday)})`,
      amount: -profile.weekly_budget,
      dynamic: true,
      balAfter: 0,
    });
    monday = addDays(monday, 7);
  }

  const payoutItems: ProjItem[] = pendingFlips.map((f) => ({
    id: "po-" + f.id,
    date: f.expected_payout_date ?? addBusinessDays(f.sold_date ?? today, 3),
    label: `eBay payout — ${f.name}`,
    amount: f.payout ?? 0,
    dynamic: true,
    balAfter: 0,
  }));

  const items: ProjItem[] = [
    ...pending.map((e) => ({
      id: e.id,
      date: e.date,
      label: e.label,
      amount: e.amount,
      recurring: !!e.recurring_rule,
      balAfter: 0,
    })),
    ...drains,
    ...payoutItems,
  ].sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1));

  let bal = cash;
  for (const it of items) {
    bal += it.amount;
    it.balAfter = bal;
  }

  const nextPay =
    pending
      .filter((e) => e.amount > 0 && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;

  const schoolEvent =
    events.find((e) => e.category === "School" && e.status !== "dismissed") ?? null;
  const schoolPaid = !!schoolEvent && schoolEvent.status === "actual";
  const schoolItem = schoolEvent ? items.find((i) => i.id === schoolEvent.id) ?? null : null;

  const flipsInvested = flips
    .filter((f) => f.status !== "planned")
    .reduce((s, f) => s + f.buy_price * f.qty, 0);
  const flipsProfit = flips
    .filter((f) => f.payout != null && (f.status === "sold" || f.status === "paid_out"))
    .reduce((s, f) => s + (f.payout ?? 0) - f.buy_price * f.qty, 0);

  // Level system: lifetime saved across all goals (ring contributions count
  // even after the diamond is bought). Level 6 unlocks with any house savings.
  const lifetimeSaved = ringRaised + savings.emergency + savings.house;
  let level = 1;
  let levelName = "Getting Started";
  for (const l of LEVELS) {
    if (lifetimeSaved >= l.min) {
      level = l.level;
      levelName = l.name;
    }
  }
  if (savings.house > 0) {
    level = 6;
    levelName = "Home Buyer";
  }

  const minBal = items.length ? Math.min(...items.map((i) => i.balAfter)) : cash;
  // Safe-to-spend is the lower of two self-consistent views:
  //  A) running-total view: minBal as computed (weekly reserve shrinks with
  //     everything you've logged, manual or imported)
  //  B) bank view: shift the whole timeline onto the bank's available balance,
  //     but only let BANK-POSTED spending shrink the weekly reserve — manual
  //     logs the bank hasn't seen yet must not free up reserve against it.
  const anchorGap = bankCash != null ? Math.max(0, cash - bankCash) : 0;
  const manualUnposted = weekSpent - weekSpentPosted;
  const minBalBank = bankCash != null ? minBal + (bankCash - cash) - manualUnposted : minBal;
  const safeToSpend = Math.max(0, Math.floor(Math.min(minBal, minBalBank)));

  return {
    cash,
    savings,
    ringRaised,
    ringSpent,
    ringBalance,
    diamondPurchased,
    weekSpent,
    pace,
    dayIdx,
    items,
    minBal,
    nextPay,
    schoolEvent,
    schoolPaid,
    schoolItem,
    pendingFlips,
    pendingPayoutTotal,
    flipsInvested,
    flipsProfit,
    safeToSpend,
    anchorGap,
    streak,
    lifetimeSaved,
    level,
    levelName,
  };
}
export type Derived = ReturnType<typeof computeDerived>;

/* ---------- balance chart series: 30 days back + 30 days forward ---------- */
export interface ChartPoint {
  date: string;
  label: string;
  actual: number | null;
  projected: number | null;
  notes: string[];
}

export function buildChartSeries(
  profile: Profile,
  txs: Tx[],
  derived: Derived,
  today = todayStr()
): ChartPoint[] {
  const points: ChartPoint[] = [];
  const start = addDays(today, -30);
  const end = addDays(today, 30);

  const notes = new Map<string, string[]>();
  for (const t of txs) {
    const delta = txCashDelta(t);
    if (delta === 0) continue;
    const arr = notes.get(t.date) ?? [];
    arr.push(`${delta >= 0 ? "+" : ""}${fmt(delta)} ${t.note || t.category || t.type}`);
    notes.set(t.date, arr);
  }

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const bal =
      profile.starting_cash +
      txs.reduce((s, t) => (t.date <= d ? s + txCashDelta(t) : s), 0);
    const v = Math.round(bal * 100) / 100;
    points.push({
      date: d,
      label: fmtDate(d),
      actual: v,
      projected: d === today ? v : null, // join the two lines at today
      notes: notes.get(d) ?? [],
    });
  }

  const futureDelta = new Map<string, number>();
  const futureNotes = new Map<string, string[]>();
  for (const it of derived.items) {
    if (it.date <= today || it.date > end) continue;
    futureDelta.set(it.date, (futureDelta.get(it.date) ?? 0) + it.amount);
    const arr = futureNotes.get(it.date) ?? [];
    arr.push(`${it.amount >= 0 ? "+" : ""}${fmt(it.amount)} ${it.label}`);
    futureNotes.set(it.date, arr);
  }

  // overdue pending items count against the starting point of the projection
  const overdue = derived.items
    .filter((i) => i.date <= today)
    .reduce((s, i) => s + i.amount, 0);
  let bal = derived.cash + overdue;
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) {
    bal += futureDelta.get(d) ?? 0;
    points.push({
      date: d,
      label: fmtDate(d),
      actual: null,
      projected: Math.round(bal * 100) / 100,
      notes: futureNotes.get(d) ?? [],
    });
  }
  return points;
}
