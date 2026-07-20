export type TxType = "income" | "expense" | "flip-buy" | "flip-sell" | "savings" | "ring-purchase";
export type SavingsTarget = "ring" | "emergency" | "house";
export type FlipStatus = "planned" | "preordered" | "owned" | "listed" | "sold" | "paid_out";
export type EventStatus = "pending" | "actual" | "dismissed";
export type RecurringRule = "biweekly" | "monthly";

export interface Profile {
  user_id: string;
  starting_cash: number;
  weekly_budget: number;
  alloc_ring: number;
  alloc_emergency: number;
  alloc_flex: number;
  school_due_date: string | null;
  school_amount: number | null;
  ring_diamond_cost: number;
  ring_setting_cost: number;
  emergency_target: number;
  notify_payday: boolean;
  notify_school: boolean;
  notify_budget: boolean;
  notify_ring: boolean;
  ring_milestone_notified: boolean;
  onboarded: boolean;
}

export interface Tx {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  date: string;
  category: string | null;
  note: string | null;
  target: SavingsTarget | null;
  flip_id: string | null;
  created_at?: string;
}

export interface Flip {
  id: string;
  user_id: string;
  name: string;
  qty: number;
  buy_price: number;
  buy_date: string | null;
  list_price: number | null;
  listed_at: string | null;
  sold_price: number | null;
  sold_date: string | null;
  shipping: number;
  fees_paid: number | null;
  payout: number | null;
  expected_payout_date: string | null;
  status: FlipStatus;
  prepaid: boolean;
  note: string | null;
}

export interface Ev {
  id: string;
  user_id: string;
  date: string;
  label: string;
  amount: number;
  category: string | null;
  status: EventStatus;
  tx_id: string | null;
  recurring_rule: RecurringRule | null;
  recurring_source_id: string | null;
}

export interface AddPrefill {
  type?: string;
  target?: SavingsTarget;
  amount?: number;
  flipId?: string;
}
