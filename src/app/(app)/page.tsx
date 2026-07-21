"use client";

import BalanceChart from "@/components/balance-chart";
import PullToRefresh from "@/components/pull-to-refresh";
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
  const { banks, syncNow, refresh } = useFinance();
  return (
    <PullToRefresh onRefresh={() => (banks.length ? syncNow() : refresh())}>
      <div className="space-y-4 page-in">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight">
            Runway <span className="text-zinc-600 text-sm font-normal">· {fmtDate(todayStr())}</span>
          </h1>
        </div>
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
      </div>
    </PullToRefresh>
  );
}
