"use client";

import BalanceChart from "@/components/balance-chart";
import {
  AllocatorCard,
  CashCard,
  DiamondBanner,
  EmergencyCard,
  PendingPayoutsCard,
  RecentList,
  RingCard,
  WeeklyCard,
} from "@/components/cards";
import { fmtDate, todayStr } from "@/lib/finance";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">
          Runway <span className="text-zinc-600 text-sm font-normal">· {fmtDate(todayStr())}</span>
        </h1>
      </div>
      <CashCard />
      <DiamondBanner />
      <PendingPayoutsCard />
      <RingCard />
      <EmergencyCard />
      <WeeklyCard />
      <BalanceChart />
      <AllocatorCard />
      <RecentList />
    </div>
  );
}
