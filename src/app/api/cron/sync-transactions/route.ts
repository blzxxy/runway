import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncUserBanks } from "@/lib/simplefin-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduled background sync (SimpleFIN) for every user with a connected bank.
 *  Hobby plan: daily. Pro: switch vercel.json to "0 star-slash-6 * * *" for every 6h.
 *  (The app also self-syncs on open when data is >6h stale.) */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: rows } = await db.from("bank_accounts").select("user_id");
  const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));

  let imported = 0;
  const errors: string[] = [];
  for (const uid of userIds) {
    const res = await syncUserBanks(db, uid);
    imported += res.imported;
    errors.push(...res.errors);
  }
  return NextResponse.json({ users: userIds.length, imported, errors });
}
