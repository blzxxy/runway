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
  today = todayStr()
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
  const dayIdx = ((fromYMD(today).getDay() + 6) % 7) + 1;
  const pace = (weekSpent / dayIdx) * 7;

  const pendingFlips = flips.filter((f) => f.status === "sold");
  const pendingPayoutTotal = pendingFlips.reduce((s, f) => s + (f.payout ?? 0), 0);

  // ---- projection through an 8-week horizon ----
  const horizon = addDays(today, 56);
  const pending = events.filter((e) => e.status === "pending" && e.date <= horizon);

  const drains: ProjItem[] = [];
  let sunday = addDays(today, (7 - fromYMD(today).getDay()) % 7);
  let first = true;
  while (sunday <= horizon) {
    const amount = first
      ? -Math.max(0, profile.weekly_budget - weekSpent)
      : -profile.weekly_budget;
    if (amount !== 0)
      drains.push({
        id: "wk-" + sunday,
        date: sunday,
        label: "Est. gas + eating out",
        amount,
        dynamic: true,
        balAfter: 0,
      });
    first = false;
    sunday = addDays(sunday, 7);
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

  const minBal = items.length ? Math.min(...items.map((i) => i.balAfter)) : cash;
  // What you can spend today with every upcoming bill, goal transfer, and the
  // weekly budget still covered for the whole 8-week horizon.
  const safeToSpend = Math.max(0, Math.floor(minBal));

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
