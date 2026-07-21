"use client";

import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export interface CelebrationSpec {
  key: string;
  title: string;
  subtitle?: string;
  cta?: string;
  colors: string[];
}

export default function Celebration({
  spec,
  onDismiss,
}: {
  spec: CelebrationSpec;
  onDismiss: () => void;
}) {
  const [canDismiss, setCanDismiss] = useState(false);

  useEffect(() => {
    try {
      navigator.vibrate?.([100, 50, 100, 50, 100]);
    } catch {}
    const bursts = [0, 250, 600].map((delay) =>
      setTimeout(
        () =>
          confetti({
            particleCount: 90,
            spread: 75,
            startVelocity: 40,
            origin: { y: 0.6 },
            colors: spec.colors,
            zIndex: 9999,
          }),
        delay
      )
    );
    const t = setTimeout(() => setCanDismiss(true), 2000);
    return () => {
      bursts.forEach(clearTimeout);
      clearTimeout(t);
    };
  }, [spec]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => canDismiss && onDismiss()}
      className="fixed inset-0 flex flex-col items-center justify-center px-8 text-center"
      style={{ zIndex: 80, background: "rgba(0,0,0,0.88)" }}
    >
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 12, delay: 0.15 }}
        className="text-4xl font-extrabold money"
      >
        {spec.title}
      </motion.h1>
      {spec.subtitle && <p className="text-zinc-300 mt-3 text-sm">{spec.subtitle}</p>}
      {spec.cta && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="mt-6 px-5 py-3 rounded-2xl bg-amber-500 text-zinc-950 font-bold"
        >
          {spec.cta}
        </button>
      )}
      <p className="text-xs text-zinc-600 mt-8" style={{ minHeight: 16 }}>
        {canDismiss ? "tap anywhere to continue" : ""}
      </p>
    </motion.div>
  );
}
