"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

/** Minimal touch pull-to-refresh: drag down from the top of the page. */
export default function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  pullRef.current = pull;

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busy) return;
      const d = e.touches[0].clientY - startY.current;
      if (d > 0 && window.scrollY <= 0) setPull(Math.min(90, d * 0.5));
    };
    const onEnd = async () => {
      if (pullRef.current > 60 && !busy) {
        setBusy(true);
        setPull(0);
        try {
          await onRefresh();
        } finally {
          setBusy(false);
        }
      } else {
        setPull(0);
      }
      startY.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [busy, onRefresh]);

  return (
    <div>
      <div
        className="flex items-end justify-center overflow-hidden"
        style={{ height: busy ? 40 : pull, transition: pull === 0 ? "height .25s" : "none" }}
      >
        <RefreshCw
          size={18}
          className={`text-zinc-500 mb-2 ${busy ? "animate-spin" : ""}`}
          style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
