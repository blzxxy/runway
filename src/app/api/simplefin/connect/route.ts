import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { claimAccessUrl, connectionName, sfinGetAccounts } from "@/lib/simplefin";
import { syncUserBanks } from "@/lib/simplefin-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Receives the one-time SimpleFIN Setup Token the user pasted, claims the
 *  permanent Access URL, stores it encrypted, registers accounts, runs a first sync. */
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const setupToken = String(body?.setupToken ?? "").trim();
  if (!setupToken) return NextResponse.json({ error: "Paste your SimpleFIN token first" }, { status: 400 });

  try {
    const accessUrl = await claimAccessUrl(setupToken);
    const set = await sfinGetAccounts(accessUrl, { balancesOnly: true });
    const accounts = set?.accounts ?? [];
    if (!accounts.length) {
      return NextResponse.json(
        { error: "SimpleFIN returned no accounts — link a bank at bridge.simplefin.org first, then make a new token" },
        { status: 422 }
      );
    }

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const enc = encrypt(accessUrl);
    const rows = accounts.map((a: any) => ({
      user_id: user.id,
      teller_enrollment_id: a.conn_id ?? "simplefin", // historical column name; holds SimpleFIN conn id
      teller_account_id: a.id,
      name: `${connectionName(set, a)} — ${a.name}`,
      type: /sav/i.test(String(a.name)) ? "savings" : "checking",
      last_balance: parseFloat(a.balance),
      access_token_encrypted: enc,
    }));
    await admin.from("bank_accounts").upsert(rows, { onConflict: "teller_account_id" });

    const sync = await syncUserBanks(admin, user.id);
    const { data: saved } = await admin
      .from("bank_accounts")
      .select("id,name,type,last_balance,last_synced_at,teller_enrollment_id,needs_reauth,last_error")
      .eq("user_id", user.id);

    return NextResponse.json({ accounts: saved ?? [], sync });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "SimpleFIN connect failed" }, { status: 500 });
  }
}
