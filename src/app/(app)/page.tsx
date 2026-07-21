"use client";

import { Flame } from "lucide-react";
import { motion } from "framer-motion";
import BalanceChart from "@/components/balance-chart";
import PullToRefresh from "@/components/pull-to-refresh";
import RingsCard from "@/components/rings";
import { Stagger } from "@/components/fx";
import { useFinance } from "@/components/finance-provider";
import {
  AllocatorCard,
  CashCard,
  DiamondBanner,
  PendingPayoutsCard,
  QuickLogCard,
  RecentList,
  SafeToSpendCard,
} from "@/components/cards";
import { fmtDate, todayStr } from "@/lib/finance";

export default function HomePage() {
  const { banks, syncNow, refresh, derived, profile } = useFinance();
  const streakBroken = derived.streak === 0 && profile.best_streak > 0;
  return (
    <PullToRefresh onRefresh={() => (banks.length ? syncNow() : refresh())}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold tracking-tight">
          Runway <span className="text-zinc-600 text-sm font-normal">· {fmtDate(todayStr())}</span>
        </h1>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs font-bold text-amber-300"
            title={derived.levelName}
          >
            Lv {derived.level}
          </span>
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
          {streakBroken && (
            <motion.span
              className="flex items-center gap-1 text-sm font-semibold text-zinc-600"
              title={`Streak broken — best ever: ${profile.best_streak}`}
              animate={{ opacity: [1, 0.25, 0.8, 0.2, 0.55] }}
              transition={{ duration: 1.4, ease: "easeInOut" }}
            >
              <Flame size={15} /> 0
            </motion.span>
          )}
        </div>
      </div>
      <Stagger className="space-y-4">
        <CashCard />
        <SafeToSpendCard />
        <QuickLogCard />
        <DiamondBanner />
        <PendingPayoutsCard />
        <RingsCard />
        <BalanceChart />
        <AllocatorCard />
        <RecentList />
      </Stagger>
    </PullToRefresh>
  );
}
