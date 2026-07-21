import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { addDays, daysUntil, fmt, todayStr, weekStartOf } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily notification check. Vercel cron hits this at 12:00 UTC (8am EDT).
 * Protected by CRON_SECRET — Vercel sends it as `Authorization: Bearer <secret>`
 * automatically when the env var is set.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: subs } = await db.from("push_subscriptions").select("*");
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0, reason: "no subscribers" });

  const today = todayStr();
  const userIds = Array.from(new Set(subs.map((s) => s.user_id)));
  let sent = 0;

  for (const uid of userIds) {
    const { data: profile } = await db.from("profiles").select("*").eq("user_id", uid).maybeSingle();
    if (!profile) continue;

    const [{ data: events }, { data: rawTxs }] = await Promise.all([
      db.from("events").select("*").eq("user_id", uid).eq("status", "pending"),
      db.from("transactions").select("*").eq("user_id", uid),
    ]);
    const txs = (rawTxs ?? []).filter((t: any) => !t.hidden);

    const msgs: { title: string; body: string }[] = [];

    // 1. Payday morning
    if (profile.notify_payday) {
      for (const e of (events ?? []).filter((e) => e.date === today && Number(e.amount) > 0)) {
        msgs.push({
          title: "Payday! 💵",
          body: `+${fmt(Number(e.amount))} (${e.label}) hits today — remember to log it as actual.`,
        });
      }
    }

    // 2 & 3. School payment reminders
    if (profile.notify_school && profile.school_due_date) {
      const schoolStillPending = (events ?? []).some((e) => e.category === "School");
      if (schoolStillPending) {
        const du = daysUntil(profile.school_due_date, today);
        if (du === 3) {
          // rough projection: cash + pending events through due date - weekly budget estimate
          let cash = Number(profile.starting_cash);
          for (const t of txs ?? []) {
            const a = Number(t.amount);
            if (t.type === "income" || t.type === "flip-sell") cash += a;
            else if (t.type === "expense" || t.type === "flip-buy" || t.type === "savings") cash -= a;
          }
          let projected = cash;
          for (const e of (events ?? []).filter((e) => e.date <= profile.school_due_date)) {
            projected += Number(e.amount);
          }
          // count Sundays between today and due date for weekly spend estimate
          let sundays = 0;
          for (let d = today; d <= profile.school_due_date; d = addDays(d, 1)) {
            const dow = new Date(d + "T12:00:00").getDay();
            if (dow === 0) sundays++;
          }
          projected -= sundays * Number(profile.weekly_budget);
          msgs.push({
            title: "School payment due in 3 days",
            body: `${fmt(Number(profile.school_amount ?? 0))} due ${profile.school_due_date}. Cash projected after paying: ${fmt(Math.round(projected))}.`,
          });
        }
        if (du === 0) {
          msgs.push({
            title: "School payment due TODAY",
            body: `${fmt(Number(profile.school_amount ?? 0))} is due today. Mark it actual once paid.`,
          });
        }
      }
    }

    // 4. Weekly budget at 90%+
    if (profile.notify_budget) {
      const ws = weekStartOf(today);
      const weekSpent = (txs ?? [])
        .filter(
          (t) =>
            t.type === "expense" &&
            (t.category === "Gas" || t.category === "Eating out") &&
            weekStartOf(t.date) === ws
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      const budget = Number(profile.weekly_budget);
      if (budget > 0 && weekSpent >= 0.9 * budget) {
        msgs.push({
          title: weekSpent >= budget ? "Weekly budget blown ⚠️" : "Weekly budget almost gone",
          body: `You've spent ${fmt(weekSpent)} of ${fmt(budget)} this week (gas + eating out).`,
        });
      }
    }

    // 4b. Sunday-night style weekly recap (cron runs daily; fires on Sundays)
    if (profile.notify_budget && new Date(today + "T12:00:00").getDay() === 0) {
      const ws = weekStartOf(today);
      const wkSpent = (txs ?? [])
        .filter(
          (t) =>
            t.type === "expense" &&
            (t.category === "Gas" || t.category === "Eating out") &&
            weekStartOf(t.date) === ws
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      let cash = Number(profile.starting_cash);
      let ring = 0;
      for (const t of txs ?? []) {
        const a = Number(t.amount);
        if (t.type === "income" || t.type === "flip-sell") cash += a;
        else if (t.type === "expense" || t.type === "flip-buy" || t.type === "savings") cash -= a;
        if (t.type === "savings" && t.target === "ring") ring += a;
      }
      msgs.push({
        title: "Week wrapped 📊",
        body: `Gas+food ${fmt(wkSpent)} of ${fmt(Number(profile.weekly_budget))} · cash ${fmt(Math.round(cash))} · ring fund ${fmt(ring)}.`,
      });
    }

    // 5. Ring fund milestone (sent once)
    if (profile.notify_ring && !profile.ring_milestone_notified) {
      let ringRaised = 0;
      let ringSpent = 0;
      for (const t of txs ?? []) {
        if (t.type === "savings" && t.target === "ring") ringRaised += Number(t.amount);
        if (t.type === "ring-purchase") ringSpent += Number(t.amount);
      }
      if (ringSpent === 0 && ringRaised >= Number(profile.ring_diamond_cost)) {
        msgs.push({
          title: "💎 Diamond funded!",
          body: `Ring fund hit ${fmt(ringRaised)} — time to buy the loose stone. Open the app to log it.`,
        });
        await db.from("profiles").update({ ring_milestone_notified: true }).eq("user_id", uid);
      }
    }

    // 6. Teller sync failed for >24h
    if (profile.notify_teller) {
      const { data: banks } = await db.from("bank_accounts").select("*").eq("user_id", uid);
      const stale = (banks ?? []).filter((b) => {
        if (b.needs_reauth) return true;
        if (!b.last_synced_at) return false;
        return Date.now() - new Date(b.last_synced_at).getTime() > 24 * 3600 * 1000;
      });
      if (stale.length > 0) {
        msgs.push({
          title: "Bank sync failed",
          body: `${stale.map((b) => b.name).join(", ")} hasn't synced in over 24h — open Settings to reconnect.`,
        });
      }
    }

    // Deliver to every device this user has registered
    const userSubs = subs.filter((s) => s.user_id === uid);
    for (const m of msgs) {
      for (const s of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: m.title, body: m.body, url: "/" })
          );
          sent++;
        } catch (err: any) {
          // Subscription expired or revoked — clean it up
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await db.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      }
    }
  }

  return NextResponse.json({ sent });
}
