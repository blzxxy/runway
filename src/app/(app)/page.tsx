"use client";

import { Flame } from "lucide-react";
import BalanceChart from "@/components/balance-chart";
import PullToRefresh from "@/components/pull-to-refresh";
import { Stagger } from "@/components/fx";
import { useFinance } from "@/components/finance-provider";
import {
  AllocatorCard,
  CashCard,
  DiamondBanner,
  EmergencyCard,
  PendingPayoutsCard,
  QuickLogCard,
  RecentList,
  RingCard,
  SafeToSpendCard,
  WeeklyCard,
} from "@/components/cards";
import { fmtDate, todayStr } from "@/lib/finance";

export default function HomePage() {
  const { banks, syncNow, refresh, derived, profile } = useFinance();
  return (
    <PullToRefresh onRefresh={() => (banks.length ? syncNow() : refresh())}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold tracking-tight">
          Runway <span className="text-zinc-600 text-sm font-normal">· {fmtDate(todayStr())}</span>
        </h1>
        {derived.streak > 0 && (
          <span
            className="flex items-center gap-1 text-sm font-semibold text-orange-400"
            title={`Days under budget · best ever: ${Math.max(profile.best_streak, derived.streak)}`}
          >
            <Flame size={15} /> {derived.streak}
            {profile.best_streak > derived.streak && (
              <span className="text-zinc-600 font-normal">/ {profile.best_streak}</span>
            )}
          </span>
        )}
      </div>
      <Stagger className="space-y-4">
        <CashCard />
        <SafeToSpendCard />
        <QuickLogCard />
        <DiamondBanner />
        <PendingPayoutsCard />
        <RingCard />
        <EmergencyCard />
        <WeeklyCard />
        <BalanceChart />
        <AllocatorCard />
        <RecentList />
      </Stagger>
    </PullToRefresh>
  );
}
