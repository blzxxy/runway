import type { RecurringRule } from "./types";

/** Defaults matching Ethan's situation as of Jul 20, 2026. Used when
 *  onboarding steps are skipped, so "skip everything" still works. */
export const DEFAULTS = {
  starting_cash: 305,
  weekly_budget: 80,
  alloc_ring: 1200,
  alloc_emergency: 300,
  alloc_flex: 218,
  school_amount: 647,
  school_due_date: "2026-08-21",
  ring_diamond_cost: 600,
  ring_setting_cost: 1400,
  emergency_target: 450,
};

export interface SeedRecurring {
  label: string;
  amount: number;
  category: string;
  start: string;
  rule: RecurringRule;
}

export const SEED_RECURRING: SeedRecurring[] = [
  { label: "Payday — Main job", amount: 752, category: "Paycheck", start: "2026-07-30", rule: "biweekly" },
  { label: "Car payment + insurance", amount: -200, category: "Car", start: "2026-07-30", rule: "biweekly" },
  { label: "Payday — New job", amount: 480, category: "Paycheck", start: "2026-08-19", rule: "biweekly" },
];

export const SEED_ONE_TIME = [
  { label: "Oil change", amount: -70, category: "Car", date: "2026-07-30" },
];

export const SEED_FLIPS = [
  { name: "Focused Fighters ETB #1", qty: 1, buy_price: 55, buy_date: "2026-07-10", list_price: 170, shipping: 11, status: "owned", prepaid: true, note: null },
  { name: "Focused Fighters ETB #2", qty: 1, buy_price: 55, buy_date: "2026-07-10", list_price: 170, shipping: 11, status: "owned", prepaid: true, note: null },
  { name: "Prismatic SPC", qty: 1, buy_price: 100, buy_date: null, list_price: 260, shipping: 11, status: "planned", prepaid: false, note: null },
  { name: "30th Anniv Celebrations ETB", qty: 2, buy_price: 0, buy_date: null, list_price: null, shipping: 11, status: "preordered", prepaid: true, note: "preorder — sell timing TBD" },
];

/** Maps a v1 artifact flip status to the v2 status enum.
 *  v1 "sold" meant money already received, so it maps to paid_out. */
export const V1_FLIP_STATUS: Record<string, string> = {
  planned: "planned",
  preordered: "preordered",
  owned: "owned",
  listed: "listed",
  sold: "paid_out",
  "paid out": "paid_out",
};
