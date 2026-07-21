"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Package, Plus, Settings } from "lucide-react";
import { useFinance } from "./finance-provider";

export default function BottomNav() {
  const path = usePathname();
  const { openAdd } = useFinance();

  const item = (href: string, label: string, Icon: typeof Home) => {
    const active = path === href;
    return (
      <Link
        href={href}
        className={`flex flex-col items-center px-3 py-1 ${
          active ? "text-zinc-100" : "text-zinc-600"
        }`}
      >
        <Icon size={20} />
        <span className="text-xs mt-0.5">{label}</span>
      </Link>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="max-w-md mx-auto px-4 pb-4 safe-bottom">
        <div className="card-glass border border-zinc-800/60 rounded-3xl flex items-center justify-around py-2 shadow-xl">
          {item("/", "Home", Home)}
          {item("/timeline", "Timeline", CalendarDays)}
          <motion.button
            onClick={() => openAdd()}
            aria-label="Add transaction"
            whileTap={{ scale: 0.9, rotate: 45 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="bg-emerald-600 active:bg-emerald-700 rounded-full p-4 -mt-8 shadow-lg border border-emerald-500 text-white"
          >
            <Plus size={28} strokeWidth={3} />
          </motion.button>
          {item("/flips", "Flips", Package)}
          {item("/settings", "Settings", Settings)}
        </div>
      </div>
    </div>
  );
}
