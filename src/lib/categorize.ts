/** Auto-categorization for imported bank transactions.
 *  Order: user-defined rules (by priority) -> built-in merchant rules -> fallback. */

export interface RuleRow {
  match_field: "merchant" | "note" | "amount";
  match_pattern: string;
  category: string;
  priority: number;
}

const GAS = ["shell", "chevron", "exxon", "mobil", "circle k", "wawa", "bp ", "7-eleven", "7 eleven", "gas"];
const EAT = [
  "mcdonald", "chick-fil-a", "chickfila", "chipotle", "starbucks", "dunkin",
  "taco bell", "wendy", "publix deli", "doordash", "uber eats", "ubereats",
];
const SAMS = ["sam's club", "sams club"];
const PAYROLL = /payroll|direct dep|dir dep|\bdd\b|deposit/i;

function amountMatches(pattern: string, amount: number): boolean {
  const abs = Math.abs(amount);
  const range = pattern.split("-").map((s) => parseFloat(s.trim()));
  if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
    return abs >= range[0] && abs <= range[1];
  }
  const exact = parseFloat(pattern);
  return !isNaN(exact) && Math.abs(abs - exact) <= 0.01;
}

export function categorize(
  description: string,
  amount: number, // Teller sign convention: negative = money out
  rules: RuleRow[],
  paycheckAmounts: number[]
): { category: string; flag?: string } {
  const desc = (description || "").toLowerCase();
  const isIncome = amount > 0;

  // 1. user rules, lowest priority number wins
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    const pat = r.match_pattern.toLowerCase();
    if (r.match_field === "amount") {
      if (amountMatches(r.match_pattern, amount)) return { category: r.category };
    } else if (desc.includes(pat)) {
      return { category: r.category };
    }
  }

  // 2. built-ins
  if (SAMS.some((m) => desc.includes(m))) {
    return { category: "Other", flag: "⚠ review — possible flip inventory" };
  }
  if (!isIncome) {
    if (GAS.some((m) => desc.includes(m))) return { category: "Gas" };
    if (EAT.some((m) => desc.includes(m))) return { category: "Eating out" };
    if (Math.abs(Math.abs(amount) - 200) <= 1) return { category: "Car" };
    return { category: "Other" };
  }
  // income
  if (PAYROLL.test(description) || paycheckAmounts.some((p) => Math.abs(p - amount) <= 5)) {
    return { category: "Paycheck" };
  }
  return { category: "Other" };
}
