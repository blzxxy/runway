import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "./crypto";
import { sfinGetAccounts } from "./simplefin";
import { categorize, type RuleRow } from "./categorize";

/** Syncs all SimpleFIN-connected accounts for one user:
 *  balances -> bank_accounts, new posted transactions -> transactions
 *  (deduped by SimpleFIN tx id, auto-categorized, auto-matched to pending events).
 *  Note: bank columns are named teller_* for historical reasons — they hold
 *  SimpleFIN ids now. */
export async function syncUserBanks(
  db: SupabaseClient,
  userId: string
): Promise<{
  imported: number;
  matched: number;
  merged: number;
  errors: string[];
  details: { id: string; desc: string; category: string; matchedLabel: string | null; eventId: string | null }[];
}> {
  const { data: rows } = await db.from("bank_accounts").select("*").eq("user_id", userId);
  if (!rows || rows.length === 0) return { imported: 0, matched: 0, merged: 0, errors: [], details: [] };

  const [{ data: rules }, { data: events }, { data: manualTxs }] = await Promise.all([
    db.from("category_rules").select("*").eq("user_id", userId).order("priority"),
    db.from("events").select("*").eq("user_id", userId).eq("status", "pending"),
    db
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "manual")
      .is("teller_id", null)
      .in("type", ["income", "expense"]),
  ]);
  const mergeCandidates = (manualTxs ?? []).slice();
  const consumed = new Set<string>();
  const paycheckAmounts = Array.from(
    new Set((events ?? []).filter((e) => Number(e.amount) > 0).map((e) => Number(e.amount)))
  );

  let imported = 0;
  let matched = 0;
  let merged = 0;
  const errors: string[] = [];
  const details: { id: string; desc: string; category: string; matchedLabel: string | null; eventId: string | null }[] = [];

  // One Access URL usually covers every account; group rows that share a ciphertext
  // (each connect stores the same encrypted URL on all its rows).
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = groups.get(r.access_token_encrypted) ?? [];
    arr.push(r);
    groups.set(r.access_token_encrypted, arr);
  }

  for (const [ciphertext, accts] of Array.from(groups.entries())) {
    let accessUrl: string;
    try {
      accessUrl = decrypt(ciphertext);
    } catch {
      errors.push("Could not decrypt a stored SimpleFIN connection — reconnect in Settings");
      continue;
    }

    try {
      const startDate = Math.floor(Date.now() / 1000) - 35 * 86400;
      const set = await sfinGetAccounts(accessUrl, { startDate });

      // surface protocol-level errors (v2 errlist / v1 errors)
      for (const e of set?.errlist ?? []) if (e?.msg) errors.push(String(e.msg).slice(0, 200));
      for (const e of set?.errors ?? []) if (typeof e === "string") errors.push(e.slice(0, 200));

      for (const acct of accts) {
        const remote = (set?.accounts ?? []).find((a: any) => a.id === acct.teller_account_id);
        if (!remote) {
          await db
            .from("bank_accounts")
            .update({ last_error: "Account not returned by SimpleFIN — it may be disconnected" })
            .eq("id", acct.id);
          continue;
        }

        const txns = (remote.transactions ?? []).filter(
          (t: any) => !t.pending && Number(t.posted) > 0
        );
        const ids = txns.map((t: any) => t.id);
        let have = new Set<string>();
        if (ids.length) {
          const { data: existing } = await db
            .from("transactions")
            .select("teller_id")
            .in("teller_id", ids);
          have = new Set((existing ?? []).map((r: any) => r.teller_id));
        }

        for (const t of txns) {
          if (have.has(t.id)) continue;
          const amt = parseFloat(t.amount); // positive = deposit
          if (isNaN(amt) || amt === 0) continue;
          const date = new Date(Number(t.posted) * 1000).toISOString().slice(0, 10);
          const desc: string = t.description || "Bank transaction";
          const isIncome = amt > 0;
          const cat = categorize(desc, amt, (rules ?? []) as RuleRow[], paycheckAmounts);

          // Auto-merge: if the user already logged this manually (same direction,
          // within $1, within 3 days), attach the bank record to their log
          // instead of creating a duplicate.
          const manualMatch = mergeCandidates.find((m: any) => {
            if (consumed.has(m.id)) return false;
            if (m.type !== (isIncome ? "income" : "expense")) return false;
            if (Math.abs(Number(m.amount) - Math.abs(amt)) > 1) return false;
            const diff = Math.abs(
              new Date(m.date + "T12:00:00").getTime() - new Date(date + "T12:00:00").getTime()
            );
            return diff <= 3 * 86400000;
          });
          if (manualMatch) {
            consumed.add(manualMatch.id);
            await db
              .from("transactions")
              .update({
                teller_id: t.id,
                account_id: acct.id,
                source: "teller",
                note: manualMatch.note || desc,
              })
              .eq("id", manualMatch.id);
            merged++;
            if (details.length < 8)
              details.push({
                id: manualMatch.id,
                desc: desc.slice(0, 40),
                category: manualMatch.category ?? cat.category,
                matchedLabel: null,
                eventId: null,
                merged: true,
              });
            continue;
          }

          const { data: ins, error: insErr } = await db
            .from("transactions")
            .insert({
              user_id: userId,
              type: isIncome ? "income" : "expense",
              amount: Math.abs(amt),
              date,
              category: cat.category,
              note: cat.flag ? `${desc} ${cat.flag}` : desc,
              source: "teller", // column value kept for compatibility; means "bank import"
              teller_id: t.id,
              account_id: acct.id,
            })
            .select()
            .single();
          if (insErr) continue; // duplicate race — skip
          imported++;
          const detail = {
            id: ins?.id as string,
            desc: desc.slice(0, 40),
            category: cat.category,
            matchedLabel: null as string | null,
            eventId: null as string | null,
          };
          if (details.length < 8 && ins) details.push(detail);

          // Auto-match a pending timeline event (paycheck / car payment):
          // same direction, amount within $5, date within ±2 days.
          const match = (events ?? []).find((e: any) => {
            if (e.status !== "pending") return false;
            const evAmt = Number(e.amount);
            if (Math.sign(evAmt) !== (isIncome ? 1 : -1)) return false;
            if (Math.abs(Math.abs(evAmt) - Math.abs(amt)) > 5) return false;
            const diff = Math.abs(
              new Date(e.date + "T12:00:00").getTime() - new Date(date + "T12:00:00").getTime()
            );
            return diff <= 2 * 86400000;
          });
          if (match && ins) {
            await db.from("events").update({ status: "actual", tx_id: ins.id }).eq("id", match.id);
            (match as any).status = "actual";
            matched++;
            detail.matchedLabel = match.label;
            detail.eventId = match.id;
          }
        }

        // available-balance excludes pending holds -> that's the spendable truth.
        const ledger = parseFloat(remote.balance);
        const avail = remote["available-balance"] != null ? parseFloat(remote["available-balance"]) : ledger;
        await db
          .from("bank_accounts")
          .update({
            last_balance: isNaN(avail) ? ledger : avail,
            ledger_balance: isNaN(ledger) ? null : ledger,
            last_synced_at: new Date().toISOString(),
            last_error: null,
            needs_reauth: false,
          })
          .eq("id", acct.id);
      }
    } catch (e: any) {
      const reauth = e?.statusCode === 403 || e?.statusCode === 402;
      errors.push(String(e?.message ?? "sync failed").slice(0, 200));
      for (const acct of accts) {
        await db
          .from("bank_accounts")
          .update({
            last_error: String(e?.message ?? "sync failed").slice(0, 300),
            needs_reauth: reauth,
          })
          .eq("id", acct.id);
      }
    }
  }

  return { imported, matched, merged, errors, details };
}
